const express = require('express');
const router = express.Router();
const { protect, checkUser } = require('../middleware/authMiddleware');
const appController = require('../controllers/appController');
const aiController = require('../controllers/aiController');
const User = require('../models/User');

// Apply checkUser to ALL routes in this file
router.use(checkUser);

// --- Public Route ---
router.get('/home', appController.getHomePage);

// --- Protected Routes (User must be logged in) ---
router.get('/profile', protect, appController.getProfilePage);
router.post('/profile', protect, appController.updateProfile);
router.get('/diet-plan', protect, aiController.getDietPlan);
router.get('/workout-plan', protect, aiController.getWorkoutPlan);
router.get('/progress', protect, appController.getProgressPage);
router.post('/progress', protect, aiController.postProgress);
router.get('/api/youtube-search', aiController.youtubeSearch);

// Update name for logged-in user
router.post('/profile/update-name', async (req, res) => {
  if (!req.user) return res.redirect('/auth/login');
  try {
    await User.findByIdAndUpdate(req.user._id, { name: req.body.name });
    res.redirect('/profile');
  } catch (err) {
    res.status(500).send('Error updating name');
  }
});

module.exports = router; 