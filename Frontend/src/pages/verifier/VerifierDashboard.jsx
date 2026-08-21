import { useEffect, useState } from "react";
import { getPendingDocuments } from "../../api/verifier.api";
import { useNavigate } from "react-router";
function VerifierDashboard () {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {

        const fetchDocuments = async () => {
            try {
                const data = await getPendingDocuments();

                console.log(data);
                console.log(data.documents.length);
                // console.log(data.documents.status);

                
                setDocuments(data.documents);

            } catch (error) {
                console.error("Failed to fetch documents:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDocuments();

    }, []);
    return (
        <main>
            <h1>Verifier Dashboard</h1>
            <p>Welcome to Verifier Dashboard</p>
            <p>Pending documents: {documents.length}</p>
            {/* console.log({documents}); */}

             {documents.length === 0 ? (
                <p>No pending documents.</p>
            ) : (
                <div>
                    {documents.map((document) => (
                        <div key={document._id}>

                            <h3>{document.title}</h3>

                            <p>
                                Type: {document.documentType}
                            </p>

                            <button onClick={() => navigate(`/verifier/request/${document.verificationRequest._id}`)}>
                                Review
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </main>
    )
}

export default VerifierDashboard;