const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');

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
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));

// Google OAuth callback
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect home.
    res.redirect('/');
  }
);

module.exports = router; 