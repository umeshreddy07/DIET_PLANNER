const User = require('../models/User');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Renders the home page with user information
 * 
 * This function handles the main landing page of the application. It fetches the latest user data
 * from the database to ensure the displayed information is current, even if the session data is stale.
 * 
 * @param {Object} req - Express request object containing user session data
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'index' view with user data or null if no user/error
 * 
 * @example
 * // Called when user visits the home page
 * app.get('/', appController.getHomePage);
 */
exports.getHomePage = async (req, res) => {
    try {
        let user = null;
        // The user object from the session might be stale.
        // If a user is logged in, fetch their latest data from the database.
        if (req.user && req.user._id) {
            user = await User.findById(req.user._id).lean();
        }
        // If there's no user from the session OR the DB fetch failed, render with null.
        // The template should handle the case where user is not logged in.
        res.render('index', { user });
    } catch (error) {
        console.error("Error fetching home page:", error);
        // Render a generic homepage or an error page if the database lookup fails
        res.render('index', { user: null });
    }
};

/**
 * Renders the user profile page
 * 
 * Displays the user's profile information and allows them to view their current settings.
 * This page shows all user data including fitness goals, measurements, and preferences.
 * 
 * @param {Object} req - Express request object containing authenticated user data
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'profile' view with user data and null success/error messages
 * 
 * @example
 * // Called when user visits /profile
 * app.get('/profile', authMiddleware.ensureAuth, appController.getProfilePage);
 */
exports.getProfilePage = async (req, res) => {
    res.render('profile', { user: req.user, success: null, error: null });
};

/**
 * Updates the user's profile information
 * 
 * This function processes form submissions to update user profile data including personal
 * information, fitness goals, dietary preferences, and daily meal preferences. It also
 * calculates BMI and ideal weight based on the provided height, weight, and gender.
 * 
 * @param {Object} req - Express request object containing form data and authenticated user
 * @param {Object} req.body - Form data including name, age, gender, height, weight, etc.
 * @param {Object} res - Express response object for rendering the updated profile
 * @returns {void} Renders the 'profile' view with updated user data and success/error messages
 * 
 * @example
 * // Called when user submits profile update form
 * app.post('/profile', authMiddleware.ensureAuth, appController.updateProfile);
 */
exports.updateProfile = async (req, res) => {
    let { name, age, gender, height, weight, fitnessGoal, activityLevel, dietaryPreference, dailyBreakfast, dailyLunch, dailySnacks, dailyDinner } = req.body;
    // Ensure dietaryPreference is always an array
    if (typeof dietaryPreference === 'string') {
        dietaryPreference = dietaryPreference.split(',').map(p => p.trim()).filter(Boolean);
    }
    // Correct the value from "Desi" to "South Indian Desi" to match the schema enum
    if (Array.isArray(dietaryPreference)) {
        dietaryPreference = dietaryPreference.map(pref => pref === 'Desi' ? 'South Indian Desi' : pref);
    }
    try {
        const userId = req.user._id;
        const heightInMeters = Number(height) / 100;
        const bmi = (Number(weight) / (heightInMeters * heightInMeters)).toFixed(2);
        const idealWeight = (gender === 'Male')
            ? (50 + 2.3 * (heightInMeters * 39.37 - 60)).toFixed(2)
            : (45.5 + 2.3 * (heightInMeters * 39.37 - 60)).toFixed(2);
        await User.findByIdAndUpdate(userId, {
            name, age, gender, height, weight, bmi, idealWeight,
            fitnessGoal, activityLevel, dietaryPreference,
            dailyBreakfast, dailyLunch, dailySnacks, dailyDinner
        });
        const updatedUser = await User.findById(userId);
        res.render('profile', { user: updatedUser, success: 'Profile Updated Successfully! Ready to generate your plan.', error: null });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).render('profile', { user: req.user, success: null, error: "Failed to update profile." });
    }
};

/**
 * Renders the progress tracking page
 * 
 * Displays the user's progress history and allows them to log new progress entries.
 * This page shows a history of all logged food and workout activities with AI-generated reviews.
 * 
 * @param {Object} req - Express request object containing authenticated user data
 * @param {Object} res - Express response object for rendering the page
 * @returns {void} Renders the 'progress' view with user data and flash messages
 * 
 * @example
 * // Called when user visits /progress
 * app.get('/progress', authMiddleware.ensureAuth, appController.getProgressPage);
 */
exports.getProgressPage = async (req, res) => {
    try {
        // We must fetch the user from the DB to ensure we have the full, up-to-date progress history.
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            req.flash('error', 'Could not find your user profile. Please log in again.');
            return res.redirect('/login');
        }
        res.render('progress', { user, review: null, success: req.flash('success'), error: req.flash('error') });
    } catch (error) {
        console.error("Error fetching progress page:", error);
        req.flash('error', 'There was an error loading your progress. Please try again.');
        res.redirect('/home');
    }
};

/**
 * Logs user progress and generates AI review
 * 
 * This function processes daily food and workout logs submitted by the user. It uses
 * Google's Gemini AI to analyze the logs in the context of the user's fitness goals
 * and provides a personalized review with a score out of 100. The progress entry is
 * then saved to the user's progress history.
 * 
 * @param {Object} req - Express request object containing form data and authenticated user
 * @param {Object} req.body - Form data containing foodLog and workoutLog
 * @param {string} req.body.foodLog - User's description of what they ate today
 * @param {string} req.body.workoutLog - User's description of their workout activities
 * @param {Object} res - Express response object for rendering the progress page
 * @returns {void} Renders the 'progress' view with updated user data and AI review
 * 
 * @example
 * // Called when user submits daily progress log
 * app.post('/progress', authMiddleware.ensureAuth, appController.logProgress);
 */
exports.logProgress = async (req, res) => {
    const { foodLog, workoutLog } = req.body;
    const user = req.user;
    try {
        const prompt = `
            You are a supportive but honest fitness coach. The user has submitted their daily log.
            Your task is to review it, provide constructive feedback, and give a score out of 100.

            USER'S GOAL: ${user.fitnessGoal}
            USER'S DIETARY PREFERENCE: ${user.dietaryPreference}

            USER'S LOG FOR TODAY:
            - What they ate: "${foodLog}"
            - What workouts they did: "${workoutLog}"

            INSTRUCTIONS:
            1. Analyze the logs in the context of their goal (${user.fitnessGoal}).
            2. Provide a 'review' (a short, encouraging paragraph, max 3-4 sentences). Point out one thing they did well and one area for improvement.
            3. Provide an 'aiScore' from 0 to 100, representing how well their logged activity aligns with their goal. Be realistic. A perfect day is 95-100. A terrible day might be 20-30.
            4. CRITICAL: Respond ONLY with a valid JSON object. No markdown, no extra text. The structure must be exactly:

            {
              "review": "Your detailed feedback paragraph here.",
              "aiScore": <A_NUMBER_BETWEEN_0_and_100>
            }
        `;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        let reviewData;
        try {
            reviewData = JSON.parse(text);
        } catch(e) {
            console.error("Error parsing progress review JSON:", text);
            return res.render('progress', { user, review: null, success: null, error: 'AI failed to generate a review. Please try again.'});
        }
        // Create a date object for today at midnight in local timezone
        const today = new Date();
        const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const progressEntry = {
            foodLog,
            workoutLog,
            aiReview: reviewData.review,
            aiScore: reviewData.aiScore,
            date: todayAtMidnight
        };
        await User.findByIdAndUpdate(user._id, {
            $push: { progressHistory: { $each: [progressEntry], $position: 0 } }
        });
        const updatedUser = await User.findById(user._id);
        res.render('progress', { user: updatedUser, review: reviewData, success: 'Progress logged and reviewed!', error: null });
    } catch (error) {
        console.error("Error logging progress:", error);
        res.status(500).render('progress', { user, review: null, success: null, error: 'An error occurred while logging progress.' });
    }
}; 