import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Unauthorized from "../pages/auth/Unauthorized";
const ProtectedRoute = ({ children, allowedRoles }) => {

    const { user, loading } = useAuth();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
};

export default ProtectedRoute;