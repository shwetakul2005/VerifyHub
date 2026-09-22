# VerifyHub frontend

The React/Vite client currently contains login and registration, applicant request pages, email-link handling, and verifier pages. It is an **in-progress** interface; the organization-admin workflow builder, invitation flow, and final responsive design are still planned.

Run `npm ci` and `npm run dev` from this directory. The API client currently points to `http://localhost:3000/api` in `src/api/axios.js`; the backend must allow `http://localhost:5173` via `FRONTEND_URL`.

Checks: `npm run lint`, `npm run build`, and `node --test src/pages/dashboard/requestStatus.test.js`.

For the product vision, complete setup, and limitations, see the [root README](../README.md).
