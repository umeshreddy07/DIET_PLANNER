const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to protect routes that require a logged-in user
const protect = (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        res.locals.user = req.user;
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check user status without protecting the route
const checkUser = (req, res, next) => {
    res.locals.user = req.user || null;
    next();
};

module.exports = { protect, checkUser }; 