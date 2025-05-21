
const express = require('express');
const router = express.Router();
const loginHelper = require('../helpers/login-helper');

// For user 'login' form
router.get('/login',(req, res) => {
  let loginError = req.session.loginError;
  req.session.loginError = false;
  if (req.session.user){
    res.redirect('/');
  }else{
    res.render('user/login',{loginError});
  }
});


// For user login
router.post('/login', async (req, res) => {
  console.log(' Received login request:', req.body);

  try {
      let response = await loginHelper.doLogin(req.body);

      // Create 'three' custom sessions ie 'loggedIn','user' and 'loggeError' for further operations
      if (response.status) {
          req.session.loggedIn = true;
          req.session.user = response.user;
          res.redirect('/');
      } else {
          req.session.loginError = true;
          res.redirect('/login');
      }
  } catch (error) {
    req.session.loginError = true;
      console.error("Login failed:", error);
      res.redirect('/login');
  }
});

// For user 'logout'
router.get('/logout',(req,res) => {
  req.session.destroy(() =>{
    res.redirect('/');
  });
});



module.exports = router;