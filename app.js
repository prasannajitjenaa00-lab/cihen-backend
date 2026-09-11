const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Route imports
const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const metaRoutes = require('./routes/metaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const followUpRoutes = require('./routes/followUpRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const studentRoutes = require('./routes/studentRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const googleRoutes = require('./routes/googleRoutes');

const app = express();

// Trust proxy for platforms like Render/Heroku behind a reverse proxy
app.set('trust proxy', 1);

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: '*', // For development, allow all. In production, restrict.
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// Body Parser with raw body capture for webhook verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/followups', followUpRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/settings', settingsRoutes);

// Root route
app.get('/api/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'School CRM API is running successfully',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
