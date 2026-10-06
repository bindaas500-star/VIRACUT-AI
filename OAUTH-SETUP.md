# ViraCut AI — Google & Facebook Sign-in Setup

Sign-in buttons app me lage hue hain, lekin **live** hone ke liye 2 IDs chahiye — ye sirf tum (app owner) bana sakte ho, main nahi. Dono free hain, ~10 minute ka kaam hai.

Tayyar ho jaye to dono IDs mujhe bhej dena — main `js/auth-config.js` me daal kar push kar dunga, aur sign-in live ho jayega.

---

## 1. Google Client ID (~5 min)

1. Kholo: **console.cloud.google.com** (apne Gmail se login)
2. Top bar me project dropdown → **New Project** → naam `ViraCut AI` → **Create**
3. Left menu → **APIs & Services** → **OAuth consent screen**
   - User type: **External** → Create
   - App name: `ViraCut AI`, User support email: tumhara email, Developer contact: tumhara email → Save & Continue (scopes waghera skip kar sakte ho)
4. Left menu → **Credentials** → **+ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `ViraCut Web`
   - **Authorized JavaScript origins** → **+ Add URI**: `https://bindaas500-star.github.io`
   - Create
5. Jo **Client ID** mile (`.apps.googleusercontent.com` par khatam hota hai) — wo mujhe bhej do.

## 2. Facebook App ID (~5 min)

1. Kholo: **developers.facebook.com** (Facebook se login) → **My Apps** → **Create App**
2. App ka naam: `ViraCut AI`, contact email do → Create
3. Left me **Add Product** → **Facebook Login** → **Set Up** → platform: **Web**
4. **Settings** (Facebook Login ke neeche) → **Valid OAuth Redirect URIs** me daalo:
   `https://bindaas500-star.github.io/VIRACUT-AI/`
5. Top left me jo **App ID** (sirf numbers) dikhe — wo mujhe bhej do.
6. (Play Store release se pehle: App Review me app ko **Live** karna hoga — abhi Development mode me testing ke liye kaafi hai.)

---

## IDs milne ke baad

Mujhe aise bhej do:

```
Google: XXXX.apps.googleusercontent.com
Facebook: 1234567890123456
```

Main `js/auth-config.js` update karke GitHub par push kar dunga — phir Profile tab par **Continue with Google / Continue with Facebook** asal me kaam karenge. Jab tak IDs nahi aatin, buttons tap karne par "not connected yet" ka message aayega (koi fake login nahi).
