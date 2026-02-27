# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Sign in" [level=2] [ref=e7]
        - paragraph [ref=e8]:
          - text: Or
          - link "create an account" [ref=e9] [cursor=pointer]:
            - /url: /signup
      - generic [ref=e10]:
        - generic [ref=e11]:
          - generic [ref=e12]:
            - text: Email
            - generic [ref=e13]: "*"
          - textbox "Email" [ref=e14]:
            - /placeholder: name@example.com
        - generic [ref=e15]:
          - generic [ref=e16]:
            - text: Password
            - generic [ref=e17]: "*"
          - textbox "Password" [ref=e18]
        - button "Sign In" [ref=e19]
      - generic [ref=e21]:
        - generic [ref=e26]: Or continue with
        - button "Sign in with Google" [ref=e27]:
          - img
          - text: Google
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e33] [cursor=pointer]:
    - img [ref=e34]
  - alert [ref=e37]
```