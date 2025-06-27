const express = require('express');
const router = express.Router();
const signupHelper = require('../helpers/signup-helper');
const nodemailer  = require('nodemailer');



// GET: Signup Form
router.get('/signup', (req, res) => {
    res.render('user/signup', { loginError: req.session.error });
    req.session.error = null;
  });
  
  
  // POST: Signup (Send OTP)
  router.post('/signup', async (req, res) => {
    const { name, email, Password } = req.body;
  
    if (!Password) {
      return res.render('user/signup', { error: 'Password is required' });
    }
  
    try {
      const emailExists = await signupHelper.checkEmailExists(email);  // Function returns 'true' or 'false'
      if (emailExists) {
        return res.render('user/signup', { error: 'Email already registered' });
      }
  
      const otp = Math.floor(100000 + Math.random() * 900000); // “Math.random()” creates ‘random’ numbers from “0” to “1”(ie “0.1”, “0.555” etc) and ‘multiply’ this into “900000” eg, 0.555 * 900000 = 499,500 and ‘plus’ “100000” ie 499500 + 100000 = 599 500 and if any ‘decimal point’ occurs “Math.floor()” remove it.
      req.session.tempUser = { name, email, Password };  // For invoke 'doSignup()'.
      req.session.otp = otp; // For compare 'otp' that recieved through email and stored in 'session'.
  
      const transporter = nodemailer.createTransport({ // Creates an 'object' contains data of sender email,service provider, password etc.
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,          
        },
      });
  
    
      const mailOptions = {  // details of email
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #ddd; padding: 20px;">
            <img src="https://yourdomain.com/logo.png" alt="Your Logo" style="height: 50px; margin-bottom: 20px;">
            <h2 style="color: #333;">Verify Your Email</h2>
            <p style="font-size: 16px; color: #555;">Use the code below to complete your signup:</p>
            <div style="font-size: 24px; font-weight: bold; background: #f2f2f2; padding: 10px 20px; width: fit-content; margin: 20px 0;">
              ${otp}
            </div>
            <p style="font-size: 14px; color: #888;">If you didn’t request this, please ignore this email.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions); // 'sendMail' used for sending mail with 'transporter' object and 'mailOptions', and returns 'Promise' object(ie 'resolved' or 'reject').
        
      res.redirect('/verify-email');
    } catch (err) {
      console.error('Signup process failed:', err);
      res.render('user/signup', { error: 'Something went wrong. Please try again.' });
    }
  });
  
  
  // For OTP input page
  router.get('/verify-email', (req, res) => {
    res.render('user/verify-email');
  });
  
  
  // For verify OTP
  router.post('/verify-otp', async (req, res) => {
    const { otp } = req.body;
  
    if (parseInt(otp) === req.session.otp) {  // Compare both ‘otp’ that get from “req.body”(ie it’s from ‘email’) and ‘otp’ that already stored in ‘session’(ie “req.session.otp”)
      try {
        let response = await signupHelper.doSignup(req.session.tempUser); // Function returns a 'document' contains user data.
  
        // After successful 'signup', reset sessions and then 'redirecting' to product section
        req.session.loggedIn = true;
        req.session.user = response;
        req.session.otp = null;
        req.session.tempUser = null;
  
        res.redirect('/');
      } catch (error) {
        console.error("Signup failed after OTP verification:", error);
        res.render('user/signup', { error: error });  
      }
    } else {
      res.render('user/verify-email', { error: 'Invalid OTP. Please try again.' });
    }
  });



  module.exports = router;