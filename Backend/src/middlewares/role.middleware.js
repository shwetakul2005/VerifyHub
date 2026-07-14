const jwt = require('jsonwebtoken')

// Role-based authorization middleware
// (...roless) => rest operator in JS gathers all the 
// params given to the function in a single array
const authRoles = (...roles) => {
  return (req, res, next) => {
        if(!roles.includes(req.user.role)){
            console.log(req.user.role);
            return res.status(403).json({
                success: false,
                message: "You aren't authorized to access this resource."
            })
        }

      next();
    }
  }


module.exports = {authRoles};

// // Usage on routes
// app.get('/admin/users', authorize(['admin']), (req, res) => {
//   // Admin-only route
// })

// app.get('/api/profile', authorize(['user', 'admin']), (req, res) => {
//   // User and admin access
// })