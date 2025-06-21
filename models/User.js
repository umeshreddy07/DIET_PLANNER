const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const progressEntrySchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    foodLog: { type: String, required: true },
    workoutLog: { type: String, required: true },
    aiReview: { type: String, required: true },
    aiScore: { type: Number, required: true }
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    age: { type: Number },
    gender: { type: String },
    height: { type: Number }, // in cm
    weight: { type: Number }, // in kg
    fitnessGoal: { type: String, enum: ['Weight Loss', 'Weight Gain', 'Fat Loss', 'Muscle Gain', 'Maintain'] },
    activityLevel: { type: String, enum: ['Sedentary', 'Moderate', 'Active'] },
    dietaryPreference: [{ type: String, enum: ['Veg', 'Non-veg', 'Vegan', 'Keto', 'South Indian Desi'] }],
    bmi: { type: Number },
    idealWeight: { type: Number },
    dailyBreakfast: { type: String },
    dailyLunch: { type: String },
    dailySnacks: { type: String },
    dailyDinner: { type: String },
    progressHistory: [progressEntrySchema],

    // --- NEW FIELDS FOR PASSWORD RESET ---
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    googleId: { type: String, unique: true, sparse: true }, // For Google login users
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to compare passwords
userSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User; 