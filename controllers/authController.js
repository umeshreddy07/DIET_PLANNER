const User = require('../models/User');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ==========================================================
// JWT & COOKIE HELPER
// ==========================================================

/**
 * Creates a JWT for a given user and sets it as a secure, httpOnly cookie.
 * 
 * This helper function generates a JSON Web Token containing the user's ID and
 * sets it as a secure cookie in the response. The token is configured with
 * appropriate security settings including httpOnly, sameSite, and secure flags.
 * 
 * @param {Object} res - The Express response object for setting cookies
 * @param {Object} user - The mongoose user object containing user data
 * @returns {void} Sets the JWT cookie in the response
 * 
 * @example
 * // Called after successful authentication
 * setTokenCookie(res, user);
 */
function setTokenCookie(res, user) {
    // Create the token payload containing the user's ID
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '7d', // Token will expire in 7 days
    });

    // Set the cookie
    res.cookie('jwt', token, {
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        sameSite: 'lax', // Protects against CSRF attacks
        secure: process.env.NODE_ENV === 'production', // Only send cookie over HTTPS in production
    });
}

// ==========================================================
// AUTHENTICATION FLOW (JWT-BASED)
// ==========================================================

/**
 * Renders the user registration page
 * 
 * This function displays the registration form where new users can create
 * their accounts. It renders the 'register' view without any data.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'register' view
 * 
 * @example
 * // Called when user visits /auth/register
 * app.get('/auth/register', authController.showRegister);
 */
exports.showRegister = (req, res) => res.render('register');

/**
 * Handles user registration form submission
 * 
 * This function processes the registration form data, validates the input,
 * checks for existing users, creates a new user account, and redirects
 * to the login page upon successful registration.
 * 
 * @param {Object} req - Express request object containing form data
 * @param {Object} req.body - Form data including name, email, password, confirmPassword
 * @param {string} req.body.name - User's full name
 * @param {string} req.body.email - User's email address
 * @param {string} req.body.password - User's chosen password
 * @param {string} req.body.confirmPassword - Password confirmation
 * @param {Object} res - Express response object for rendering or redirecting
 * @returns {void} Renders register page with errors or redirects to login on success
 * 
 * @example
 * // Called when user submits registration form
 * app.post('/auth/register', authController.register);
 */
exports.register = async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;
    let errors = [];

    if (!name || !email || !password || !confirmPassword) {
        errors.push({ msg: 'Please enter all fields' });
    }
    if (password != confirmPassword) {
        errors.push({ msg: 'Passwords do not match' });
    }
    if (password.length < 6) {
        errors.push({ msg: 'Password must be at least 6 characters' });
    }

    if (errors.length > 0) {
        return res.render('register', { errors, name, email });
    }

    try {
        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            errors.push({ msg: 'Email is already registered' });
            return res.render('register', { errors, name, email });
        }
        
        const newUser = new User({ name, email, password });
        await newUser.save();

        req.flash('success', 'You are now registered and can log in');
        res.redirect('/auth/login');

    } catch(err) {
        console.error(err);
        res.render('register', { errors: [{msg: "Something went wrong, please try again."}] });
    }
};

/**
 * Renders the user login page
 * 
 * This function displays the login form where existing users can authenticate
 * and access their accounts. It renders the 'login' view without any data.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'login' view
 * 
 * @example
 * // Called when user visits /auth/login
 * app.get('/auth/login', authController.showLogin);
 */
exports.showLogin = (req, res) => res.render('login');

/**
 * Handles user login form submission using JWT authentication
 * 
 * This function processes the login form data using Passport.js local strategy
 * for authentication. Upon successful authentication, it creates a JWT token
 * and sets it as a secure cookie, then redirects to the profile page.
 * 
 * @param {Object} req - Express request object containing form data
 * @param {Object} res - Express response object for setting cookies and redirecting
 * @param {Function} next - Express next function for error handling
 * @returns {void} Redirects to login page with error or to profile page on success
 * 
 * @example
 * // Called when user submits login form
 * app.post('/auth/login', authController.login);
 */
exports.login = (req, res, next) => {
    // We tell passport to NOT use sessions and use our custom callback
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            return next(err); // Handle server errors
        }
        if (!user) {
            // Authentication failed. 'info' contains the message from passport-local strategy.
            req.flash('error', info.message);
            return res.redirect('/auth/login');
        }
        
        // --- Authentication Succeeded ---
        // 1. Create and set the JWT cookie
        setTokenCookie(res, user);
        
        // 2. Redirect to the profile page
        res.redirect('/profile');

    })(req, res, next);
};

/**
 * Handles user logout by clearing JWT cookie
 * 
 * This function clears the JWT authentication cookie from the user's browser,
 * effectively logging them out of the application. It then redirects to the
 * login page with a success message.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object for clearing cookies and redirecting
 * @param {Function} next - Express next function for error handling
 * @returns {void} Clears JWT cookie and redirects to login page
 * 
 * @example
 * // Called when user clicks logout
 * app.get('/auth/logout', authController.logout);
 */
exports.logout = (req, res, next) => {
    res.clearCookie('jwt'); // Remove the token cookie
    req.flash('success', 'You have been successfully logged out.');
    res.redirect('/auth/login');
};

// ==========================================================
// PASSWORD RESET LOGIC (No changes needed here)
// ==========================================================

/**
 * Renders the forgot password page
 * 
 * This function displays the forgot password form where users can request
 * a password reset link to be sent to their email address.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'forgotPassword' view
 * 
 * @example
 * // Called when user visits /auth/forgot
 * app.get('/auth/forgot', authController.showForgotPassword);
 */
exports.showForgotPassword = (req, res) => res.render('forgotPassword');

/**
 * Handles forgot password form submission and sends reset email
 * 
 * This function processes the forgot password form, generates a secure reset token,
 * saves it to the user's account with an expiration time, and sends an email
 * containing a link to reset their password.
 * 
 * @param {Object} req - Express request object containing email address
 * @param {Object} req.body - Form data containing email
 * @param {string} req.body.email - User's email address for password reset
 * @param {Object} res - Express response object for redirecting
 * @returns {void} Redirects to forgot password page with success/error message
 * 
 * @example
 * // Called when user submits forgot password form
 * app.post('/auth/forgot', authController.sendResetLink);
 */
exports.sendResetLink = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            req.flash('error', 'No account with that email address exists.');
            return res.redirect('/auth/forgot');
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const transporter = nodemailer.createTransporter({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT, 10),
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_FROM,
            subject: 'FitGenie Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2>Password Reset Request</h2>
                    <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
                    <p>Please click on the button below, or paste the link into your browser to complete the process. This link is valid for one hour.</p>
                    <a href="http://${req.headers.host}/auth/reset/${token}" style="background-color: #3b82f6; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 20px 0;">Reset Your Password</a>
                    <p style="font-size: 12px; color: #777;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);

        req.flash('success', `An e-mail has been sent to ${user.email} with further instructions.`);
        res.redirect('/auth/forgot');

    } catch(err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/auth/forgot');
    }
};

/**
 * Renders the password reset page with token validation
 * 
 * This function validates the reset token from the URL and renders the
 * password reset form if the token is valid and not expired. If the token
 * is invalid or expired, it redirects to the forgot password page.
 * 
 * @param {Object} req - Express request object containing reset token
 * @param {string} req.params.token - The password reset token from the URL
 * @param {Object} res - Express response object for rendering or redirecting
 * @returns {void} Renders reset password page or redirects to forgot password page
 * 
 * @example
 * // Called when user clicks reset link from email
 * app.get('/auth/reset/:token', authController.showResetPassword);
 */
exports.showResetPassword = async (req, res) => {
    const user = await User.findOne({ 
        resetPasswordToken: req.params.token, 
        resetPasswordExpires: { $gt: Date.now() } 
    });

    if (!user) {
        req.flash('error', 'Password reset token is invalid or has expired.');
        return res.redirect('/auth/forgot');
    }
    res.render('resetPassword', { token: req.params.token, user: null });
};

/**
 * Handles password reset form submission
 * 
 * This function processes the password reset form, validates the new password,
 * updates the user's password in the database, and clears the reset token.
 * Upon successful password reset, it redirects to the login page.
 * 
 * @param {Object} req - Express request object containing form data and token
 * @param {string} req.params.token - The password reset token from the URL
 * @param {Object} req.body - Form data containing new password and confirmation
 * @param {string} req.body.password - New password
 * @param {string} req.body.confirmPassword - Password confirmation
 * @param {Object} res - Express response object for redirecting
 * @returns {void} Redirects to login page on success or back to reset page on error
 * 
 * @example
 * // Called when user submits new password
 * app.post('/auth/reset/:token', authController.resetPassword);
 */
exports.resetPassword = async (req, res) => {
    try {
        const user = await User.findOne({ 
            resetPasswordToken: req.params.token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('back');
        }
        
        if(req.body.password !== req.body.confirmPassword) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('back');
        }

        // Assign the new password directly; let the pre-save hook hash it
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();
        req.flash('success', 'Success! Your password has been changed.');
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('back');
    }
}; 