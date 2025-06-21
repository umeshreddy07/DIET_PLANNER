const User = require('../models/User');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Render Home Page
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

// Render Profile Page
exports.getProfilePage = async (req, res) => {
    res.render('profile', { user: req.user, success: null, error: null });
};

// Update Profile
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

// Render Progress Page
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

// Log Progress and get AI review
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
        const progressEntry = {
            foodLog,
            workoutLog,
            aiReview: reviewData.review,
            aiScore: reviewData.aiScore,
            date: new Date()
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