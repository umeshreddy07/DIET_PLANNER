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

// Temporary force logout route for testing
router.get('/force-logout', (req, res) => {
    res.clearCookie('jwt');
    res.clearCookie('connect.sid');
    req.flash('success', 'All sessions cleared. You can now test with different Google accounts.');
    res.redirect('/auth/login');
});

// Forgot Password Routes
router.get('/forgot', authController.showForgotPassword);
router.post('/forgot', authController.sendResetLink);
router.get('/reset/:token', authController.showResetPassword);
router.post('/reset/:token', authController.resetPassword);

// Initiate Google OAuth
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false, // We are not using sessions
    prompt: 'select_account' // Force account selection
}));

// Google OAuth callback
router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/auth/login', 
        session: false // IMPORTANT: Ensure sessions are not used
    }), 
    (req, res) => {
        console.log('🎯 Google OAuth Callback Debug:');
        console.log('  - User ID:', req.user._id);
        console.log('  - User Name:', req.user.name);
        console.log('  - User Email:', req.user.email);
        console.log('  - Google ID:', req.user.googleId);
        
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
        console.log('  - JWT cookie set, redirecting to profile');
        res.redirect('/profile');     // Redirect to the user's dashboard
    }
);

module.exports = router; 