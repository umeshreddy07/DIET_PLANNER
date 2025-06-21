const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require('../models/User'); // Correctly import the User model at the top
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// ==========================================================
// THE "BULLETPROOF" HELPER FUNCTION
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
 * GET DIET PLAN - The AI's Creative Kitchen
 */
exports.getDietPlan = async (req, res) => {
    try {
        const user = req.user;
        if (!user.fitnessGoal || !user.weight || !user.dietaryPreference) {
            return res.redirect('/profile'); 
        }

        const prompt = `
            You are FitBot 3000, a sassy, hilarious, and expert AI nutrition coach.
            Your prime directive is to create a scientifically-backed, joyful, and effective nutrition plan based on the user's specific data.
            Your tone is a "light roast" – you poke fun gently but immediately pivot to empowering, expert advice. Your core message is ALWAYS "You've got this."

            **USER'S COMPLETE PROFILE:**
            - Name: ${user.name}
            - Age: ${user.age}
            - Gender: ${user.gender}
            - Height: ${user.height} cm
            - Weight: ${user.weight} kg
            - **Primary Goal: ${user.fitnessGoal}** (This is the most important directive!)
            - Activity Level: ${user.activityLevel}
            - Chosen Dietary Style: ${user.dietaryPreference} (This is a non-negotiable rule!)

            **YOUR CRITICAL MISSION:**
            1.  **GOAL-DRIVEN PLAN:** This is not a generic meal plan. It MUST be specifically tailored to the user's primary goal of **'${user.fitnessGoal}'**.
                - If **'Muscle Gain'** or **'Weight Gain'**, the portions and food types must be higher in calories and protein.
                - If **'Weight Loss'** or **'Fat Loss'**, the plan must be in a slight caloric deficit, focusing on high-satiety foods.
                - If **'Maintain'**, create a balanced plan for their current stats.
                - Your food choices must reflect this core logic. This is the top priority.

            2.  **Craft a "Mission Briefing" (userSummary):** Start with a short, funny, but ultimately empowering summary that acknowledges their specific goal.
                - Example for 'Muscle Gain': "Alright, ${user.name}! The mission, should you choose to accept it, is codenamed 'Operation Bulk Up'. Time to build! 💪"
                - This entire summary MUST be a single string for the 'userSummary' field in the JSON.

            3.  **Build a 1-Day Meal Plan:** For EACH meal (Breakfast, Lunch, Snacks, Dinner), suggest THREE distinct recipe options.
            
            4.  **DIETARY RULE ADHERENCE:** You MUST strictly adhere to the user's Dietary Style ('${user.dietaryPreference}'). No exceptions.

            5.  **For EACH food option, provide the following fields in perfect JSON:**
                -   'name': The name of the dish (e.g., "The 'Un-be-leaf-able' Palak Paneer").
                -   'description': A 1-2 sentence funny, motivating description.
                -   'quantity': A clear portion size, adjusted for the user's goal (e.g., "1 large bowl (approx 400g) for muscle gain").
                -   'reasons': An array of TWO strings, framed as "Secret Superpowers," explaining *why* it helps their specific goal.

            6.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object. No extra text, no markdown. The format is { "userSummary": "...", "breakfast": [...], "lunch": [...], "snacks": [...], "dinner": [...] }.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = cleanAIResponse(response.text());

        if (!text) {
             return res.render('dietPlan', { user, dietPlan: null, userSummary: null, error: 'The AI seems to be on a coffee break and sent back an empty response. Please try again!' });
        }

        const parsedResponse = JSON.parse(text);
        const { userSummary, ...dietPlan } = parsedResponse;
        res.render('dietPlan', { user, dietPlan, userSummary, error: null });

    } catch (error) {
        console.error("AI Diet Plan Generation Error:", error);
        res.render('dietPlan', { user, dietPlan: null, userSummary: null, error: 'Could not connect to the AI Command Center. Please check the network and try again.' });
    }
};


/**
 * GET WORKOUT PLAN - TEXT ONLY, NO YOUTUBE LINKS
 */
exports.getWorkoutPlan = async (req, res) => {
    try {
        const user = req.user;
        if (!user.fitnessGoal || !user.activityLevel) {
            return res.redirect('/profile');
        }

        const prompt = `
            You are FitBot 3000, a world-class AI fitness coach who creates hyper-personalized workout plans.
            Your mission is to create a workout that is fun, motivational, and scientifically designed for the user's specific body and goals.
            Your tone is a "light roast" but always supportive and expert.

            **USER'S COMPLETE PROFILE:**
            - Name: ${user.name}
            - Age: ${user.age}
            - Gender: ${user.gender}
            - **Primary Goal: ${user.fitnessGoal}** (This is the most important directive!)
            - **Current Activity Level: ${user.activityLevel}** (This dictates the workout's intensity!)

            **YOUR CRITICAL MISSION PROTOCOLS:**
            1.  **GOAL & LEVEL-SPECIFIC DESIGN:** The workout MUST be tailored to the user's goal ('${user.fitnessGoal}') and activity level ('${user.activityLevel}').
                - If **'Muscle Gain'**, focus on hypertrophy (e.g., 3-4 sets, 8-12 reps) and progressive overload.
                - If **'Weight Loss'** or **'Fat Loss'**, focus on compound movements and metabolic conditioning to maximize calorie burn.
                - If **'Maintain'**, create a balanced full-body routine.
                - If **'Sedentary'**, the workout must be simple, shorter, and use foundational movements.
                - If **'Active'**, you can include more complex exercises and higher volume.
                - This is your top priority. Do not create a generic plan.

            2.  **Craft a "Mission Accepted" Briefing (userSummary):** Start with a short (2-3 sentences), funny, and epic summary that mentions their goal.
            
            3.  **Design a 5-Exercise Workout Plan for Today:** Select a balanced mix of exercises perfectly suited for the user's complete profile.

            4.  **For EACH of the 5 exercises, you MUST provide the following fields in perfect JSON:**
                -   'name': The standard, common gym name for the exercise (e.g., "Barbell Squat", "Dumbbell Bench Press", "Deadlift"). Do NOT invent creative or funny names.
                -   'description': A 1-2 sentence funny, motivating description.
                -   'setsAndReps': A clear directive for how many to do, specifically chosen for their goal (e.g., "3 Sets of 10 Reps for hypertrophy").
                -   'instructions': An array of 3-4 short, numbered, step-by-step strings on how to perform the exercise.
                -   'benefits': An array of TWO strings, framed as "Level-Up Perks," explaining how it helps their specific goal.

            5.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object. No extra text or markdown.
                {
                  "userSummary": "Your funny and motivating summary here.",
                  "workoutPlan": [ 
                      { "name": "...", "description": "...", "setsAndReps": "...", "instructions": ["...", "..."], "benefits": ["...", "..."] },
                      ... (5 total exercise objects)
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
        res.render('workoutPlan', { user, workoutPlan: null, userSummary: null, error: 'Could not connect to the AI Command Center. Looks like it took a water break.' });
    }
};


/**
 * POST PROGRESS LOG - The AI's Daily Report Card
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
            You are FitBot 3000, an expert AI fitness and nutrition coach. You are sassy, motivating, and provide detailed, actionable advice.
            Your task is to analyze the user's daily logs, provide a comprehensive and helpful review, and give them a score out of 10.

            **USER'S COMPLETE PROFILE:**
            - Goal: ${user.fitnessGoal}
            - Age: ${user.age}
            - Gender: ${user.gender}
            - Activity Level: ${user.activityLevel}
            - Typical Diet Style: ${user.dietaryPreference}

            USER'S LOGS FOR TODAY:
            - Food Log: "${foodLog}"
            - Workout Log: "${workoutLog}"

            YOUR MISSION:
            1.  **Analyze Holistically:** Deeply analyze the food and workout logs IN THE CONTEXT OF THE USER'S SPECIFIC GOAL ('${user.fitnessGoal}'). This is the most important part of your analysis.
            2.  **Generate a Score (aiScore):** Based on your goal-oriented analysis, provide an integer score from 1 to 10.
            3.  **Write a Detailed Review (aiReview):** Your review must be a single, well-structured string.

                **Food Analysis:**
                - Praise a food choice that aligns with their '${user.fitnessGoal}' goal.
                - Identify 1-2 items that do not align with their goal.
                - Suggest specific, healthier alternatives that would better support their goal of '${user.fitnessGoal}'. For instance, if the goal is 'Muscle Gain' and they skipped a meal, you must suggest a high-protein option. If the goal is 'Fat Loss' and they ate cake, suggest a low-calorie dessert.

                **Workout Analysis:**
                - Analyze their workout in relation to their '${user.fitnessGoal}' and '${user.activityLevel}'.
                - If the workout was good, explain WHY it was good for their goal.
                - If the workout was missing or light, suggest a simple, specific exercise that would directly help them achieve '${user.fitnessGoal}'.

                **Closing Motivation:**
                - End with a powerful, motivating sentence.

            4.  **FINAL OUTPUT FORMAT:** Respond ONLY with a valid JSON object.
                {
                  "aiScore": 7,
                  "aiReview": "Mission report received, ${user.name}! Let's dive in.\\n\\n**Food Analysis:**\\nThat chicken breast at dinner was a perfect choice for your Muscle Gain goal! However, the jam and bread in the morning is mostly sugar and won't build the quality mass you're looking for. A much better choice would be 3-4 scrambled eggs or a bowl of oats with nuts to start your day with protein and complex carbs.\\n\\n**Workout Analysis:**\\nI see you played cricket, which is great for overall activity! To really accelerate your muscle-building goal, let's add some targeted resistance training. Tomorrow, try to incorporate 3 sets of dumbbell rows. It will directly help build a stronger back.\\n\\nEvery small change adds up to a huge victory. You're doing great, keep building!"
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

        req.flash('success', `Progress logged! The AI gave you a score of ${aiScore}/10! Check out the review below.`);
        res.redirect('/progress');

    } catch (error) {
        console.error("Progress Logging Error:", error);
        req.flash('error', 'A server error occurred while logging progress.');
        res.redirect('/progress');
    }
};

// =============================
// YOUTUBE SEARCH ENDPOINT
// =============================
exports.youtubeSearch = async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    try {
        const apiKey = "AIzaSyC_pp-FR8to7C-bzYrONV5DY0YMVvIh_PY";
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${apiKey}`;
        const response = await axios.get(url);
        const items = response.data.items;
        if (items && items.length > 0) {
            const videoId = items[0].id.videoId;
            return res.json({ videoId, url: `https://www.youtube.com/watch?v=${videoId}` });
        } else {
            return res.status(404).json({ error: 'No video found' });
        }
    } catch (err) {
        console.error('YouTube API error:', err);
        return res.status(500).json({ error: 'YouTube API error' });
    }
};