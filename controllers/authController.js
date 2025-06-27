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
 * @param {object} res - The Express response object.
 * @param {object} user - The mongoose user object.
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

// Show Register Page
exports.showRegister = (req, res) => res.render('register');

// Handle Register POST
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

// Show Login Page
exports.showLogin = (req, res) => res.render('login');

/**
 * Handle Login POST - The JWT Way
 * We use a custom callback to handle the result of authentication.
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
 * Handle Logout - The JWT Way
 * We simply clear the JWT cookie from the user's browser.
 */
exports.logout = (req, res, next) => {
    res.clearCookie('jwt'); // Remove the token cookie
    req.flash('success', 'You have been successfully logged out.');
    res.redirect('/auth/login');
};

// ==========================================================
// PASSWORD RESET LOGIC (No changes needed here)
// ==========================================================
exports.showForgotPassword = (req, res) => res.render('forgotPassword');
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

        const transporter = nodemailer.createTransport({
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