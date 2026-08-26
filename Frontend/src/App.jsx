import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Dashboard from "./pages/dashboard/Dashboard";
// import ProtectedRoute from "./routes/ProtectedRoute";
import ProtectedRoute from "./routes/ProtectedRouter"
import Unauthorized from "./pages/auth/Unauthorized";
import VerifierDashboard from "./pages/verifier/VerifierDashboard";
import VerificationRequest from "./pages/verifier/VerificationRequest";
import UserSingleVerificationRequest from "./pages/dashboard/VerificationRequests";
import VerifyEmail from "./pages/auth/VerifyEmail";

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route
                    path="/login"
                    element={<Login />}
                />

                <Route
                    path="/register"
                    element={<Register />}
                />

                <Route 
                    path="/unauthorized"
                    element={<Unauthorized />}
                />

                <Route
                    path="/verify-email/:token"
                    element={<VerifyEmail />}
                />

                {/* user dashboard */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute allowedRoles={["user"]}>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="dashboard/request/:id"
                    element={
                        <ProtectedRoute allowedRoles={["verifier", "user", "admin"]}>
                            <UserSingleVerificationRequest />
                        </ProtectedRoute>
                    }
                />

                {/* verifier dashboard */}
                <Route
                    path="/verifier"
                    element={
                        <ProtectedRoute allowedRoles={["verifier"]}>
                            <VerifierDashboard />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/verifier/request/:id"
                    element={
                        <ProtectedRoute allowedRoles={"verifier"}>
                            <VerificationRequest />
                        </ProtectedRoute>
                    }
                />
                    

                {/* admin dashboard */}
                {/* <Route
                    path="/admin"
                    element={
                        <ProtectedRoute allowedRoles={["admin"]}>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                /> */}

            </Routes>
        </BrowserRouter>
    );
}

export default App;