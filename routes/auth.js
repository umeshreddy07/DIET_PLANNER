const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const jwt = require('jsonwebtoken');

// GET routes to display the pages
router.get('/register', authController.showRegister);
router.get('/login', authController.showLogin);

// POST routes to handle form submissions
router.post('/register', authController.register);
router.post('/login', authController.login);

// GET route for logout
router.get('/logout', authController.logout);

// Forgot Password Routes
router.get('/forgot', authController.showForgotPassword);
router.post('/forgot', authController.sendResetLink);
router.get('/reset/:token', authController.showResetPassword);
router.post('/reset/:token', authController.resetPassword);

// Initiate Google OAuth
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false // We are not using sessions
}));

// Google OAuth callback
router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/auth/login', 
        session: false // IMPORTANT: Ensure sessions are not used
    }), 
    (req, res) => {
        // --- Custom Callback Logic ---
        // If passport authentication was successful, the user object is attached to req.user.
        // We now need to manually create our JWT and set the cookie.
        const setTokenCookie = (res, user) => {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.cookie('jwt', token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            });
        };
        setTokenCookie(res, req.user); // Create JWT for the Google-authenticated user
        res.redirect('/profile');     // Redirect to the user's dashboard
    }
);

module.exports = router; 