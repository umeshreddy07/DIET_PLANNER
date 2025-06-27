const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protects routes that require a logged-in user.
 * It checks for a JWT in the cookies, verifies it, and attaches the user to the request.
 * If the token is invalid or missing, it redirects to the login page.
 */
const protect = async (req, res, next) => {
    let token;

    // 1. Check if the 'jwt' cookie exists
    if (req.cookies && req.cookies.jwt) {
        try {
            token = req.cookies.jwt;
            
            // 2. Verify the token using the secret
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // 3. Find the user by the ID from the token's payload
            // We select '-password' to exclude the hashed password from the result
            const currentUser = await User.findById(decoded.id).select('-password');

            if (currentUser) {
                // 4. If user exists, attach them to the request object
                req.user = currentUser;
                res.locals.user = currentUser; // Also make user available in templates
                return next(); // User is authenticated, proceed to the route handler
            }
        } catch (error) {
            console.error('Authentication error:', error.message);
            // Fallthrough to redirect if token is invalid or any error occurs
        }
    }

    // If we reach here, it means no valid token was found.
    req.flash('error', 'You must be logged in to view that page.');
    res.redirect('/auth/login');
};

/**
 * Checks for a user without protecting the route.
 * Populates res.locals.user if logged in, otherwise sets it to null.
 * This is useful for templates that need to show different content for guests vs. logged-in users (e.g., in the header).
 */
const checkUser = async (req, res, next) => {
    // This logic is similar to protect, but it will never redirect.
    if (req.cookies && req.cookies.jwt) {
        try {
            const token = req.cookies.jwt;
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const currentUser = await User.findById(decoded.id).select('-password');
            
            if (currentUser) {
                req.user = currentUser;
                res.locals.user = currentUser;
            } else {
                res.locals.user = null; // Token is valid but user doesn't exist anymore
            }
        } catch (error) {
            res.locals.user = null; // Token is invalid
        }
    } else {
        res.locals.user = null; // No token found
    }
    next();
};

module.exports = { protect, checkUser }; 