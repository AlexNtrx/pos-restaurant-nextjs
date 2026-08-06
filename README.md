# POS Restaurant Workshop

A restaurant POS and backoffice workshop project built with Next.js and a separate Node.js/Express backend.

This project is currently under improvement. It is used for learning, refactoring, and practicing full-stack development.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Axios
- AdminLTE 3
- Bootstrap 5
- Tailwind CSS 4
- Chart.js
- Day.js
- SweetAlert2
- ESLint

## Main Features

- Sign-in page
- Custom Bearer-token authentication flow
- Role-based back-office access
- Dashboard
- Food management
- Food type and food size management
- Taste management
- Organization management
- Sales management
- Daily and monthly sales reports
- General sales report
- Food list pagination
- Redirects from legacy routes

## Architecture

This repository contains only the frontend application.

The frontend communicates with a separate REST API through Axios.

```text
Next.js frontend
        ↓
Axios REST requests
        ↓
Separate backend API