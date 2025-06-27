require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const User = require('./models/User');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');

// --- Import the NEW authMiddleware ---
const { checkUser } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/app');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware (still required for connect-flash)
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-different-secret-for-flash',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 } // Short-lived session just for flash messages
}));
app.use(flash());

// =============================
// PASSPORT CONFIGURATION (JWT Method)
// =============================
app.use(passport.initialize());
// -- REMOVED app.use(passport.session()) --
// We are now stateless and don't need Passport to manage sessions.

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email: email });
        if (!user) return done(null, false, { message: 'Incorrect email.' });
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return done(null, false, { message: 'Incorrect password.' });
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
      // Try to find user by googleId
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        // If not found, try to find by email
        user = await User.findOne({ email: profile.emails[0].value });
        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.isVerified = true;
          await user.save();
        } else {
          // Create a new user if not found by email
          user = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName || '',
            isVerified: true,
            password: crypto.randomBytes(20).toString('hex')
          });
          await user.save();
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));
// -- REMOVED passport.serializeUser and passport.deserializeUser --
// These are not needed for a stateless JWT authentication strategy.
// Our protect and checkUser middlewares now handle retrieving the user.

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===================================
// GLOBAL MIDDLEWARE
// ===================================

// Make flash messages available in all templates
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// -- USE checkUser on ALL routes --
app.use(checkUser);

// ========================================================
// DAILY REMINDER CRON JOB (No change needed here)
// ========================================================
cron.schedule('0 22 * * *', async () => {
    console.log(`[${new Date().toLocaleString()}] Running daily reminder check...`);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
        // Find all users...
        const allUsers = await User.find({});
        const usersToRemind = [];

        // Manually check if each user has logged progress today
        for (const user of allUsers) {
            const hasLoggedToday = user.progressHistory.some(
                entry => entry.date >= todayStart
            );
            if (!hasLoggedToday) {
                usersToRemind.push(user);
            }
        }

        if (usersToRemind.length === 0) {
            console.log('All active users have logged their progress. No reminders needed.');
            return;
        }
        console.log(`Found ${usersToRemind.length} users to remind.`);

        // --- NEW TRANSPORTER CONFIGURATION ---
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT, 10),
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Send an email to each user who hasn't logged
        for (const user of usersToRemind) {
            const mailOptions = {
                to: user.email,
                from: process.env.EMAIL_FROM,
                subject: 'Your AI Coach is Waiting! 😉',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h3>Hey ${user.name}!</h3>
                        <p>Just a friendly poke from your AI coach at FitGenie.</p>
                        <p>We noticed you haven't logged your progress for today yet. Consistency is the secret sauce to crushing your goals!</p>
                        <p>Take 2 minutes to log your day and get your AI score:</p>
                        <a href="http://localhost:3000/progress" style="background-color: #3b82f6; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 10px;">Log Your Progress Now</a>
                        <p style="margin-top: 20px;">You got this!</p>
                        <p><strong>- FitBot 3000</strong></p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`Reminder email sent to ${user.email}`);
        }
    } catch (err) {
        console.error('Error sending daily reminder emails:', err);
    }
}, {
    timezone: "Asia/Kolkata" // IMPORTANT: Replace with your actual timezone
});

// --- ROUTES ---
app.use('/auth', authRoutes);
app.use('/', appRoutes);

// Redirect root to home page
app.get('/', (req, res) => {
    res.redirect('/home');
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
}); 