// Middleware function used for check 'user' 'logged in' or 'not'
// middleware/verifyLogin.js
module.exports = (req,res,next) => {
    if (req.session.loggedIn){
      next();
    }else{
      res.redirect('/login');
    }
  };