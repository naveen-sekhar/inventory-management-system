# Inventory Management System

Full-stack inventory management application with authentication, stock tracking, sales, supplier management, reporting, and automated email alerts.

## What This Project Includes

- Backend API built with Express and MongoDB
- Frontend dashboard served from the same Node.js server
- Role-based access (admin, manager, staff)
- Inventory, suppliers, sales, logs, analytics, and reports modules
- Automated low-stock alerts and daily PDF inventory reports via email
- Optional Vercel deployment support

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Nodemailer for email delivery
- PDFKit for report generation
- node-cron for scheduled jobs

## Prerequisites

Install these before running the project:

- Node.js 14+ (Node.js 18 LTS recommended)
- npm
- MongoDB Atlas account (or accessible MongoDB instance)
- Git

## Quick Start (Run On A New Computer)

### 1. Clone and install dependencies

```bash
git clone <your-repository-url>
cd Inventory-Management
npm install
```

### 2. Create environment file

Use one of the following commands:

PowerShell:

```powershell
Copy-Item .env.example .env
```

Command Prompt:

```bat
copy .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Then edit `.env` with your real values (see Environment Variables section).

### 3. Seed demo users (optional but recommended)

```bash
npm run seed
```

This creates:

- admin / admin123
- manager1 / manager123
- staff1 / staff123

Important: the seed script clears all existing users before creating demo users.

### 4. Start the app

Production-style start (works everywhere):

```bash
npm start
```

Open: http://localhost:5000

Development mode with auto-reload:

```bash
npm run dev
```

If `npm run dev` fails because nodemon is missing, install it once:

```bash
npm install -D nodemon
```

## Environment Variables

Create `.env` using `.env.example` and set:

```env
# Server
PORT=5000
HOST=0.0.0.0

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# Auth
JWT_SECRET=your_super_secret_jwt_key_here_minimum_32_characters

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_16_character_app_password
EMAIL_FROM=your_email@gmail.com

# Runtime
NODE_ENV=development

# Optional CORS allowlist for production
# ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Required External Setup

### MongoDB Atlas

1. Create a cluster.
2. Create a database user.
3. Add network access (IP allowlist).
4. Put the full connection string in `MONGO_URI`.

### Gmail App Password (for email alerts)

1. Enable 2FA on your Google account.
2. Generate an App Password.
3. Use that app password in `EMAIL_PASS`.

## NPM Scripts

- `npm start` - Start server with `node server.js`
- `npm run dev` - Start with nodemon auto-reload
- `npm run seed` - Seed demo users (deletes current users)
- `npm test` - Placeholder script (no automated tests configured yet)

## Verify Everything Is Working

### Health check

Browser or curl:

```bash
curl http://localhost:5000/api/health
```

PowerShell:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

Expected response includes server status, DB status, and timestamp.

### Login test

Use seeded credentials on the dashboard login screen:

- Username: admin
- Password: admin123

### Test email alert flows manually

```bash
node test-alerts.js
```

This connects to MongoDB, checks low-stock items, and sends the daily report email flow.

## Project Architecture

### Entry points

- `server.js` - Main Express application
- `api/index.js` - Vercel serverless entry (exports app)
- `public/dashboard.html` - Main frontend page served at `/`

### Main API route groups

- `/api/auth`
- `/api/items`
- `/api/suppliers`
- `/api/sales`
- `/api/reports`
- `/api/users`
- `/api/logs`
- `/api/analytics`
- `/api/shop`
- `/api/ecommerce`
- `/api/recipients`
- `/api/health`

### Core folders

```text
api/         # Serverless entry
config/      # DB and bot config
middleware/  # Auth middleware
models/      # Mongoose models
public/      # Frontend HTML/CSS/JS
routes/      # Express routes
scripts/     # Utility + seed scripts
services/    # Email, alerts, reports
UN/          # Deployment and setup docs
```

## Scheduled Jobs

The backend schedules these jobs (non-serverless runtime):

- Low stock check: daily at 9:00 AM
- Daily inventory report: daily at 6:00 PM

Note: scheduled jobs are not initialized on Vercel serverless runtime.

## Deployment Notes

For full deployment instructions, see:

- `UN/DEPLOYMENT.md`
- `UN/VERCEL_DEPLOY.md`
- `UN/EMAIL_RECIPIENTS_GUIDE.md`

Quick production start command:

```bash
npm start
```

## Troubleshooting

### App does not start

- Run `npm install` again.
- Check Node version: `node -v`.
- Ensure `.env` exists and has required values.

### MongoDB connection fails

- Verify `MONGO_URI` is valid.
- Confirm Atlas network allowlist includes your current IP.
- Confirm database user credentials are correct.

### Email sending fails

- Confirm `EMAIL_USER` and `EMAIL_PASS` are set.
- For Gmail, ensure App Password is used (not account password).
- Check spam folder for test emails.

### Port 5000 already in use

- Change `PORT` in `.env`.
- Or stop the process currently using port 5000.

## Security Notes

- Never commit `.env` to source control.
- Rotate credentials immediately if secrets were exposed.
- Change default seeded credentials in real environments.
- Use a strong, random `JWT_SECRET` (32+ bytes).

## Recommended First Commands

If you want the shortest path from zero to running app:

```bash
git clone <your-repository-url>
cd Inventory-Management
npm install
npm install -D nodemon
# Create and edit .env from .env.example
npm run seed
npm run dev
```