import {useState} from "react" 
import { loginUser } from "../../api/auth.api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router";


function Login() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const {login} = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e){
        e.preventDefault();

        // const data = await loginUser({email,password});
        // const data = await useAuth.login({email,password});
        const data = await login({
            email,
            password
        });

        if(data.user.role === "admin") {
            navigate("/admin");
        }
        else if(data.user.role === "verifier"){
            navigate("/verifier");
        }
        else{
            navigate("/dashboard");
        }
        
        console.log("LOGIN RESPONSE:", data);
    }

    
    return (
        <main>

            <div className="form-container">
                <h1>Login</h1>
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input type="email" id="email" name='email' placeholder="Enter email address" value={email} onChange={(e) => setEmail(e.target.value)}/>
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input type="password" id="password" name='password' placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)}/>
                    </div>
                    <button className="button primary-button" type="submit">Login</button>
                </form>
            </div>
        </main>
    );
}

export default Login;