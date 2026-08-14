import { useAuth } from "../../context/AuthContext";

function Dashboard() {

    const { user, logout } = useAuth();

    return (
        <div>
            <h1>VerifyHub</h1>

            <h2>
                Welcome, {user?.username}
            </h2>

            <p>
                Role: {user?.role}
            </p>

            <button onClick={logout}>
                Logout
            </button>
        </div>
    );
}

export default Dashboard;