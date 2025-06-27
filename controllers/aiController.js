const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require('../models/User');
const axios = require('axios');

// It's highly recommended to move API keys to a .env file for security.
// Your .env file: GEMINI_API_KEY=...
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ==========================================================
// HELPER FUNCTION (No changes needed)
// ==========================================================
function cleanAIResponse(rawText) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error("Robust Cleaner: No JSON-like block found in AI response.");
        return null;
    }
    let jsonString = jsonMatch[0];
    jsonString = jsonString.replace(/,\s*([\}\]])/g, '$1');
    return jsonString;
}


// ==========================================================
// CONTROLLER FUNCTIONS
// ==========================================================

/**
 * GET DIET PLAN - AI's Creative Kitchen (Text-Only as per dietPlan.ejs)
 * -- UPGRADED PROMPT FOR GOAL ADHERENCE --
 */
exports.getDietPlan = async (req, res) => {
    try {
        const user = req.user;
        if (!user.fitnessGoal || !user.weight || !user.dietaryPreference) {
            req.flash('error', 'Your profile is incomplete! Please set a goal, weight, and diet style.');
            return res.redirect('/profile'); 
        }

        const prompt = `
            You are FitBot 3000, a sassy, hilarious, and expert AI nutrition coach.
            Your prime directive is to create a scientifically-backed, joyful, and effective nutrition plan. Your tone is a "light roast" – you poke fun gently but immediately pivot to empowering, expert advice.

            **USER'S COMPLETE PROFILE:**
            - Name: ${user.name}
            - Goal: ${user.fitnessGoal} (This is the most important directive!)
            - Weight: ${user.weight} kg
            - BMI: ${user.bmi}
            - Ideal Weight: ${user.idealWeight} kg
            - Dietary Styles: ${user.dietaryPreference} (This is a non-negotiable rule!)

            **YOUR CRITICAL MISSION & RULES:**
            1.  **ULTRA GOAL-FOCUSED PLAN:** This is NOT a generic plan. It MUST be specifically tailored to the user's primary goal of **'${user.fitnessGoal}'**. This is your top priority.
                - If goal is **'Muscle Gain'** or **'Weight Gain'**, portions MUST be larger, and food choices higher in calories and protein.
                - If goal is **'Weight Loss'** or **'Fat Loss'**, the plan MUST create a caloric deficit with high-satiety foods. Portions must be controlled.
                - If goal is **'Maintain'**, create a balanced plan for their TDEE.
                - **CRITICAL FAILURE:** Suggesting a high-calorie "bulking" meal for a 'Fat Loss' goal is unacceptable. You must be precise.

            2.  **STRICT DIETARY ADHERENCE:** You MUST strictly adhere to all chosen Dietary Styles ('${user.dietaryPreference}'). If it says 'Veg' and 'Keto', all meals must be both vegetarian AND keto. No exceptions.

            3.  **Craft a "Mission Briefing" (userSummary):** A short, funny, but empowering summary for the user. Example for 'Fat Loss': "Alright, ${user.name}, let's get ready to rumble... with that salad. Kidding! We're about to make 'lean and mean' delicious. Let's do this! 🔥"

            4.  **Build a 1-Day Meal Plan:** For EACH meal (Breakfast, Lunch, Snacks, Dinner), suggest THREE distinct recipe options.
            
            5.  **For EACH food option, provide these fields in perfect JSON:**
                -   'name': A creative name (e.g., "The 'Un-be-leaf-able' Palak Paneer").
                -   'description': A 1-2 sentence funny, motivating description.
                -   'quantity': A CLEAR portion size, adjusted for the user's goal (e.g., "1 large bowl (approx 450g) for muscle gain", "1 medium bowl (approx 250g) for fat loss").
                -   'reasons': An array of TWO strings, as "Secret Superpowers," explaining WHY it helps their specific goal.

            6.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object. No extra text or markdown.
                { "userSummary": "...", "breakfast": [...], "lunch": [...], "snacks": [...], "dinner": [...] }
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = cleanAIResponse(response.text());

        if (!text) {
             return res.render('dietPlan', { user, dietPlan: null, userSummary: null, error: 'The AI seems to be on a coffee break. Please try again!' });
        }

        const parsedResponse = JSON.parse(text);
        const { userSummary, ...dietPlan } = parsedResponse;
        res.render('dietPlan', { user, dietPlan, userSummary, error: null });

    } catch (error) {
        console.error("AI Diet Plan Generation Error:", error);
        res.render('dietPlan', { user, dietPlan: null, userSummary: null, error: 'Could not connect to the AI Command Center. Please check the network.' });
    }
};


/**
 * GET WORKOUT PLAN - WITH YOUTUBE VIDEO SEARCH QUERIES
 * -- UPGRADED PROMPT FOR VIDEOS & GOAL ADHERENCE --
 */
exports.getWorkoutPlan = async (req, res) => {
    const user = req.user;
    try {
        if (!user.fitnessGoal || !user.activityLevel) {
            req.flash('error', 'Your profile is incomplete! Please set a goal and activity level.');
            return res.redirect('/profile');
        }

        const prompt = `
            You are FitBot 3000, a world-class AI fitness coach who finds the best workout videos. Your tone is a "light roast" but always supportive and expert.

            **USER'S COMPLETE PROFILE:**
            - Goal: ${user.fitnessGoal} (This is the most important directive!)
            - Activity Level: ${user.activityLevel} (This dictates intensity!)
            - Weight: ${user.weight} kg, BMI: ${user.bmi}

            **YOUR CRITICAL MISSION PROTOCOLS:**
            1.  **GOAL & LEVEL-SPECIFIC DESIGN:** The plan MUST be tailored to BOTH the user's goal ('${user.fitnessGoal}') AND activity level ('${user.activityLevel}').
                - If **'Muscle Gain'**, suggest exercises for hypertrophy (e.g., "dumbbell bench press", "barbell rows") and use search terms like "build muscle".
                - If **'Weight Loss'** or **'Fat Loss'**, suggest compound movements and HIIT, using search terms like "full body calorie burn".
                - If **'Sedentary'**, workout MUST be simple, short, and use search terms like "beginner" and "low impact".
                - **CRITICAL FAILURE:** Do not suggest a high-intensity "advanced HIIT" workout for a 'Sedentary' user. This is your top priority.

            2.  **Craft a "Mission Accepted" Briefing (userSummary):** A short (2-3 sentences), funny, and epic summary.
            
            3.  **Design a 5-Exercise Workout Plan for Today.**

            4.  **For EACH of the 5 exercises, provide these fields in perfect JSON:**
                -   'name': Standard gym name (e.g., "Goblet Squat").
                -   'searchQuery': A perfectly crafted YouTube search query to find a high-quality "how-to" video. This is for the frontend to use. Example: "how to do goblet squat correctly with dumbbell".
                -   'description': A 1-2 sentence funny, motivating description.
                -   'setsAndReps': A clear directive chosen for their goal (e.g., "3 Sets of 10 Reps").
                -   'instructions': An array of 3 short, step-by-step strings on how to perform it.
                -   'benefits': An array of TWO strings, as "Level-Up Perks," explaining how it helps their specific goal.

            5.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object. No extra text or markdown.
                {
                  "userSummary": "Mission briefing received, ${user.name}! Time to turn that 'maybe tomorrow' into 'machine mode' today. Let's get it! 💪",
                  "workoutPlan": [ 
                      { 
                        "name": "Goblet Squat", 
                        "searchQuery": "how to perform goblet squat with one dumbbell",
                        "description": "The king of leg day that also secretly sculpts your core. Squat like you've got a secret... a really heavy secret.",
                        "setsAndReps": "3 Sets of 12 Reps",
                        "instructions": ["Hold a dumbbell vertically against your chest.", "Keeping your chest up and back straight, lower your hips down and back.", "Push through your heels to return to the starting position."],
                        "benefits": ["Builds powerful legs and glutes, a key engine for metabolism.", "Improves core stability and total body strength."]
                      }
                   ]
                }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = cleanAIResponse(response.text());

        if (!text) {
             console.error("CRITICAL ERROR: WORKOUT AI response contained no valid JSON block.");
             return res.render('workoutPlan', { user, workoutPlan: null, userSummary: null, error: 'The AI coach is on a water break. Please try generating again!' });
        }

        const parsedResponse = JSON.parse(text);
        const { userSummary, workoutPlan } = parsedResponse;
        
        res.render('workoutPlan', { user, workoutPlan, userSummary, error: null });

    } catch (error) {
        console.error("AI Workout Plan Generation Error:", error);
        res.render('workoutPlan', { user, workoutPlan: null, userSummary: null, error: 'Could not connect to the AI Command Center.' });
    }
};


/**
 * POST PROGRESS LOG - AI's Daily Report Card
 * -- FIXED HEATMAP UPDATE & UPGRADED PROMPT --
 */
exports.postProgress = async (req, res) => {
    try {
        const { foodLog, workoutLog } = req.body;
        const user = await User.findById(req.user._id);
        
        if (!user) {
            req.flash('error', 'Could not find your user profile. Please log in again.');
            return res.redirect('/login');
        }

        if (!foodLog || !workoutLog) {
            req.flash('error', 'Please fill out both the food and workout logs.');
            return res.redirect('/progress');
        }

        const prompt = `
            You are FitBot 3000, an expert AI coach. You're sassy, motivating, and give actionable advice. Analyze the user's daily log and give them a score and review.

            **USER'S COMPLETE PROFILE & PRIMARY DIRECTIVE:**
            - **Main Goal: ${user.fitnessGoal}**
            - Ideal Weight: ${user.idealWeight} kg
            - Activity Level: ${user.activityLevel}

            **CRITICAL ANALYSIS INSTRUCTIONS:**
            - Your ENTIRE analysis (food, workout, score) MUST be based on how well the user's actions align with their specific goal of '${user.fitnessGoal}'.
            - If their goal is 'Fat Loss' and they ate a whole pizza, the score must be low and the review must explain WHY that choice hinders their goal and suggest a better alternative (like a high-protein flatbread pizza).
            - If their goal is 'Muscle Gain' and they only did light cardio, the review must state that resistance training is necessary.

            **USER'S LOGS FOR TODAY:**
            - Food Log: "${foodLog}"
            - Workout Log: "${workoutLog}"

            **YOUR MISSION:**
            1.  **Generate a Score (aiScore):** Based on your goal-oriented analysis, provide an integer score from 1 to 10.
            2.  **Write a Detailed Review (aiReview):** A single, well-structured string.
                -   **Food Analysis:** Praise one good choice. Identify one choice that conflicts with their goal. Suggest a specific, healthier alternative that helps achieve '${user.fitnessGoal}'.
                -   **Workout Analysis:** Explain why their workout was good or bad for their goal. If bad, suggest a specific exercise type to add.
                -   **Closing Motivation:** End with a powerful, motivating sentence.
            3.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object.
                {
                  "aiScore": 6,
                  "aiReview": "Report received, ${user.name}! Let's dive in.\n\n**Food Analysis:**\nThat chicken at dinner was a bullseye for your ${user.fitnessGoal} goal! On the other hand, the sugary cereal for breakfast was a step sideways. For a stronger start, try Greek yogurt with berries to get quality protein.\n\n**Workout Analysis:**\nGood on you for getting a run in! To really push towards your ${user.fitnessGoal} target, you need to add resistance. Tomorrow, try adding 3 sets of push-ups, even on your knees!\n\nProgress isn't a straight line, it's about showing up. You showed up today. Let's crush it again tomorrow!"
                }
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = cleanAIResponse(response.text());

        if (!text) {
             req.flash('error', 'The AI is currently refueling and couldn\'t process your log. Please try again!');
             return res.redirect('/progress');
        }

        const parsedResponse = JSON.parse(text);
        const { aiScore, aiReview } = parsedResponse;
        
        user.progressHistory.push({ date: new Date(), foodLog, workoutLog, aiScore, aiReview });
        await user.save();

        req.flash('success', `Progress logged! The AI gave you a score of ${aiScore}/10! Your Consistency Map has been updated.`);
        
        // ==========================================================
        //  HEATMAP FIX: Redirect to the profile page to see update!
        // ==========================================================
        res.redirect('/profile');

    } catch (error) {
        console.error("Progress Logging Error:", error);
        req.flash('error', 'A server error occurred while logging progress.');
        res.redirect('/progress'); // Redirect back to progress on error
    }
};

/**
 * YOUTUBE SEARCH ENDPOINT for workoutPlan.ejs
 */
exports.youtubeSearch = async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    try {
        // --- SECURITY WARNING ---
        // This key is publicly exposed. Please move it to a .env file.
        // Create a .env file in your root folder and add:
        // YOUTUBE_API_KEY=AIza...
        const apiKey = process.env.YOUTUBE_API_KEY || "AIzaSyC_pp-FR8to7C-bzYrONV5DY0YMVvIh_PY";
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${apiKey}`;
        
        const response = await axios.get(url);
        
        if (response.data.items && response.data.items.length > 0) {
            const videoId = response.data.items[0].id.videoId;
            return res.json({ videoId }); // Only send the ID, it's all the frontend needs.
        } else {
            return res.status(404).json({ error: 'No video found' });
        }
    } catch (err) {
        console.error('YouTube API error:', err.response ? err.response.data : err.message);
        return res.status(500).json({ error: 'YouTube API error' });
    }
};