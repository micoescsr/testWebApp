# Page snapshot

```yaml
- generic [ref=e4]:
  - img [ref=e6]
  - heading "Login to your account" [level=1] [ref=e8]
  - generic [ref=e9]:
    - generic [ref=e10]:
      - generic [ref=e11]: Email
      - textbox "Enter your email" [ref=e12]: test@example.com
    - generic [ref=e13]:
      - generic [ref=e14]: Password
      - textbox "Enter your password" [ref=e15]: password123
    - paragraph [ref=e16]:
      - link "Forgot your password?" [ref=e17] [cursor=pointer]:
        - /url: /forgot-password
    - paragraph [ref=e18]: ⚠ Invalid login credentials
    - button "Login now" [ref=e19] [cursor=pointer]
```