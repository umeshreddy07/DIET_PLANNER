const User = require('../models/User');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Helper to create JWT and set cookie
function setTokenCookie(res, user) {
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('jwt', token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    });
}

// ========================
// AUTHENTICATION FLOW
// ========================

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

// Handle Login POST
exports.login = (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/profile', // Success -> Go to Profile/Dashboard
        failureRedirect: '/auth/login',
        failureFlash: true
    })(req, res, next);
};

// Handle Logout
exports.logout = (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.flash('success', 'You are logged out');
        res.redirect('/auth/login');
    });
};

// ===============================
// PASSWORD RESET LOGIC
// ===============================

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