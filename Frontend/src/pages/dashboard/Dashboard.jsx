import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getAllRequests } from "../../api/applicant.api";
import { useNavigate } from "react-router";
// import { Navigate } from "react-router";

function Dashboard() {

    const { user, logout } = useAuth();
    // const id = user
    const [verificationRequests, setVerificationRequests] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const id = user.id;
    const navigate = useNavigate();

    useEffect(() => {
            const fetchRequest = async () => {
                console.log("fetchRequest started");
                console.log("userId:", id);
    
                try {
                    const data = await getAllRequests(id);
    
                    console.log("Verification request data:", data);
    
                    setVerificationRequests(data);
                } catch (error) {
                    console.error(
                        "Failed to fetch verification request:",
                        error
                    );
                } finally {
                    setLoading(false);
                }
            };
    
            fetchRequest();
        }, [id]);
        
        if (loading) {
            return <div>Loading verification requests...</div>;
        }

        if (error) {
            return <div>{error}</div>;
        }

    return (
        <main>
            <h1>My Verification Requests</h1>

            <h2>
                Welcome, {user?.username}
            </h2>

            <button onClick={logout}>
                Logout
            </button>

            <hr />

            {verificationRequests.length === 0 ? (
                <p>No verification requests found.</p>
            ) : (
                verificationRequests.map((request) => (
                    <section key={request._id}>
                        <h2>
                            {request.organization?.name}
                        </h2>

                        <p>
                            <strong>Workflow:</strong>{" "}
                            {request.workflowTemplate?.name}
                        </p>

                        <p>
                            <strong>Status:</strong>{" "}
                            {request.status}
                        </p>

                        <p>
                            <strong>Current Step:</strong>{" "}
                            {request.currentStep?.title}
                        </p>

                        <p>
                            <strong>Step Type:</strong>{" "}
                            {request.currentStep?.stepType}
                        </p>

                        <button onClick = {() => navigate(`/dashboard/request/${request._id}`)}>
                            View Request
                        </button>

                        <hr />
                    </section>
                ))
            )}
        </main>
    );
}

export default Dashboard;