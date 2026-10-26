# Travel Photo Journal - Backend API

REST API for the Travel Photo Journal application. Built with NestJS, TypeORM, MySQL, and JWT authentication. Includes automated email verification via Brevo SMTP, Cloudinary media storage with per-user folder isolation, OpenRouter AI description summarization, and TOTP Two-Factor Authentication (2FA) with recovery codes.

---

## Tech Stack

- **Runtime & Framework**: Node.js (v20+ recommended, ESM), NestJS 12
- **Database & ORM**: MySQL (via `mysql2`), TypeORM 1.1
- **Authentication**: Passport JWT, bcryptjs, TOTP (`otpauth`), QR code generation (`qrcode`), AES-256-GCM secret encryption
- **File Storage**: Cloudinary SDK (organized per-user folders)
- **AI Integration**: OpenRouter API (`openrouter/free` or custom LLM)
- **Email Delivery**: Nodemailer via Brevo SMTP
- **Testing & Code Quality**: Vitest, Oxlint

---

## Architecture Overview

```
src/
├── ai/                     # OpenRouter AI summarization service
├── auth/                   # Authentication, JWT strategy, TOTP 2FA, rate limiting
│   ├── dto/                # Request validation schemas (DTOs)
│   ├── guards/             # JwtAuthGuard
│   ├── strategies/         # Passport JWT Strategy (blocks partial 2FA tokens)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── two-factor.service.ts # AES-256-GCM encryption, QR codes, anti-replay
├── cloudinary/             # Cloudinary upload/delete with user-scoped folders
├── mail/                   # Brevo SMTP transport & verification email templates
├── photos/                 # Photo journal CRUD with owner isolation & AI summary
│   ├── dto/
│   ├── entities/
│   ├── photos.controller.ts
│   └── photos.service.ts
├── users/                  # User entity & MySQL repository queries
│   ├── entities/
│   └── users.service.ts
├── app.module.ts           # Root module
└── main.ts                 # Bootstrap with global validation pipe & CORS
```

---

## Prerequisites

1. **Node.js**: v20.x or v22.x/v24.x
2. **MySQL**: Running instance (e.g. XAMPP MySQL, Docker, or native service on `127.0.0.1:3306`)
3. **Cloudinary Account**: API key, secret, and cloud name
4. **Brevo Account**: SMTP credentials for transactional verification emails
5. **OpenRouter Account**: API key for travel description summarization

---

## Getting Started

### 1. Database Setup

Create the database in MySQL:

```sql
CREATE DATABASE travel_photo_journey_orbitwick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# MySQL Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=travel_photo_journey_orbitwick

# JWT & Security
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=7d
TWO_FACTOR_ENCRYPTION_KEY=your_32_character_aes_encryption_key

# Brevo SMTP (Email Verification)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_login
SMTP_PASS=your_brevo_smtp_key
EMAIL_FROM="Travel Photo Journal <no-reply@yourdomain.com>"

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_api_key
OPENROUTER_MODEL=openrouter/free
```

### 3. Installation

```bash
npm install
```

### 4. Running the Application

```bash
# Development (with file watcher)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The server starts at `http://localhost:3000`.

---

## API Reference

All requests accept and return `application/json` unless marked `multipart/form-data`. Protected routes require the `Authorization: Bearer <token>` header.

### 1. Authentication & Email Verification

#### Register
- **`POST /auth/register`**
- **Body**:
  ```json
  {
    "name": "Jane Traveler",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "message": "Registration successful. A 6-digit verification code has been sent to your email.",
    "email": "jane@example.com",
    "isEmailVerified": false
  }
  ```

#### Verify Email
- **`POST /auth/verify-email`**
- **Body**:
  ```json
  {
    "email": "jane@example.com",
    "code": "481029"
  }
  ```
- **Rules**: 5-minute expiry, max 5 attempts before lockout. Token is intentionally not issued here; the user must log in after verification.
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Email verified successfully. You can now log in.",
    "email": "jane@example.com",
    "isEmailVerified": true
  }
  ```

#### Resend Verification Code
- **`POST /auth/resend-code`**
- **Body**: `{ "email": "jane@example.com" }`
- **Rules**: Enforces a strict 3-minute cooldown between requests.
- **Response (`200 OK`)**:
  ```json
  {
    "message": "A new 6-digit verification code has been sent to your email. It expires in 5 minutes."
  }
  ```

#### Login
- **`POST /auth/login`**
- **Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (`200 OK`) - When 2FA is OFF**:
  ```json
  {
    "message": "Login successful",
    "token_type": "Bearer",
    "access_token": "eyJhbGciOiJIUzI1Ni...",
    "user": {
      "id": 1,
      "name": "Jane Traveler",
      "email": "jane@example.com",
      "bio": null,
      "avatar": null
    }
  }
  ```
- **Response (`200 OK`) - When 2FA is ON (Strict Two-Step Flow)**:
  ```json
  {
    "requires2fa": true,
    "twoFactorToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "message": "Two-factor authentication required. Please provide your 6-digit authenticator code or a recovery code."
  }
  ```

#### Get Current User Profile
- **`GET /auth/profile`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Response (`200 OK`)**: User details.

---

### 2. Two-Factor Authentication (2FA / TOTP)

#### Check 2FA Status
- **`GET /auth/2fa/status`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Response (`200 OK`)**:
  ```json
  {
    "isTwoFactorEnabled": false
  }
  ```

#### Generate 2FA Secret & QR Code
- **`POST /auth/2fa/generate`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Response (`200 OK`)**:
  ```json
  {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "data:image/png;base64,iVBORw0KGgo...",
    "otpauthUrl": "otpauth://totp/TravelPhotoJournal:jane%40example.com?issuer=TravelPhotoJournal&secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30",
    "message": "Scan this QR code in your authenticator app..."
  }
  ```

#### Enable 2FA & Receive Recovery Codes
- **`POST /auth/2fa/enable`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Body**: `{ "code": "123456" }`
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Two-factor authentication enabled successfully. Save your recovery codes in a safe place.",
    "isTwoFactorEnabled": true,
    "recoveryCodes": [
      "A1B2-C3D4",
      "E5F6-G7H8",
      "I9J0-K1L2",
      "M3N4-O5P6",
      "Q7R8-S9T0",
      "U1V2-W3X4",
      "Y5Z6-A7B8",
      "C9D0-E1F2"
    ]
  }
  ```

#### Authenticate 2FA Login Session
- **`POST /auth/2fa/authenticate`**
- **Body**:
  ```json
  {
    "twoFactorToken": "eyJhbGciOiJIUzI1Ni...",
    "code": "123456"
  }
  ```
  *(Accepts either the current 6-digit TOTP code or an unconsumed recovery code like `"A1B2-C3D4"`)*
- **Security Protections**:
  - Max 5 failed attempts before 15-minute lockout.
  - Anti-replay protection prevents reusing the same 6-digit code within the same 30-second window.
  - Recovery codes are single-use and automatically removed from the database once redeemed.
- **Response (`200 OK`)**: Standard login payload with the final `access_token`.

#### Disable 2FA
- **`POST /auth/2fa/disable`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Body**:
  ```json
  {
    "password": "Password123!",
    "code": "123456"
  }
  ```
- **Response (`200 OK`)**: `{ "message": "Two-factor authentication disabled successfully", "isTwoFactorEnabled": false }`

---

### 3. Travel Photos CRUD

All `/photos` endpoints are strictly isolated by authenticated user (`req.user.id`). Users cannot view, modify, or delete photos owned by other users.

#### List Current User's Photos
- **`GET /photos`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Response (`200 OK`)**: Array of photo objects ordered by `created_at DESC`.

#### Upload Photo
- **`POST /photos`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `name`: string (e.g. `"Sunrise over Mount Fuji"`)
  - `location`: string (e.g. `"Fujikawaguchiko, Japan"`)
  - `description`: string (e.g. `"Early morning hike up to Chureito Pagoda with clear views of Fuji's snowcap."`)
  - `image`: binary file (JPEG, PNG, WebP, GIF)
- **Automatic Background Processing**:
  1. Uploads to Cloudinary in a dedicated user folder: `travel-photo-journal/user_<userId>/`.
  2. Queries OpenRouter AI to generate a 1-2 sentence captivating summary from the description.
  3. Saves record into MySQL with `ai_summary`.
- **Response (`201 Created`)**:
  ```json
  {
    "id": 1,
    "name": "Sunrise over Mount Fuji",
    "location": "Fujikawaguchiko, Japan",
    "description": "Early morning hike up to Chureito Pagoda with clear views of Fuji's snowcap.",
    "imageUrl": "https://res.cloudinary.com/.../travel-photo-journal/user_1/...jpg",
    "cloudinaryPublicId": "travel-photo-journal/user_1/...",
    "aiSummary": "Experience the tranquil early morning trek to Chureito Pagoda, taking in breathtaking views of Mount Fuji's pristine snowcap at dawn.",
    "userId": 1,
    "createdAt": "2026-10-27T01:00:00.000Z",
    "updatedAt": "2026-10-27T01:00:00.000Z"
  }
  ```

#### Get Photo Details
- **`GET /photos/:id`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Response (`200 OK`)**: Single photo object. Returns `404 Not Found` if photo does not exist or belongs to another user.

#### Edit Photo
- **`PUT /photos/:id`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Content-Type**: `multipart/form-data` or `application/json` (if not updating image)
- **Form Fields (all optional)**:
  - `name`: string
  - `location`: string
  - `description`: string *(if provided, automatically re-generates `ai_summary` via OpenRouter)*
  - `image`: binary file *(if provided, uploads new image and deletes the old Cloudinary asset)*
- **Response (`200 OK`)**: Updated photo object with refreshed `aiSummary`.

#### Delete Photo
- **`DELETE /photos/:id`**
- **Headers**: `Authorization: Bearer <access_token>`
- **Action**: Deletes the Cloudinary image asset and deletes the MySQL database record.
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Photo and its stored file deleted successfully"
  }
  ```

---

## Testing & Quality Assurance

```bash
# Run unit & integration test suites
npm test

# Run linter
npm run lint

# Compile TypeScript
npm run build
```

---

## Security Practices Implemented

- **Password Hashing**: Salted bcrypt (10 rounds).
- **TOTP Encryption**: Secrets encrypted at rest using AES-256-GCM.
- **Token Segregation**: Temporary 2FA tickets (`type: '2fa_ticket'`) are blocked from calling protected business endpoints.
- **Anti-Replay**: Step counter tracking prevents reusing 2FA tokens within the 30-second window.
- **Recovery Hashing**: Single-use recovery codes stored as SHA-256 hashes.
- **Rate-Limiting**: Verification codes & 2FA attempts lock out after 5 consecutive failures.
- **Input Sanitization**: NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.
