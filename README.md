[JPMC-Web-Experiment-mParticle-Guide.md](https://github.com/user-attachments/files/27027104/JPMC-Web-Experiment-mParticle-Guide.md)
# Web Experiment with mParticle — Setup Guide for JPMC

## Quick Context

Web Experiment is the right starting point for your marketing use cases as it's less engineering lift than the full Feature Experimentation SDK, and you can always layer that in later.

Because mParticle is your sole event source, you'll need a custom integration plugin so the Web Experiment script knows who the user is and routes events through mParticle. There's no out-of-the-box mParticle integration for Web Experiment (only Segment and Tealium have those), so this requires a small custom setup. It would be preferrable to use our analytics Browser SDK.

## What You'll Need

- Your **Amplitude project API key** (for the Web Experiment script)
- Your **mParticle SDK** already loading on the page
- Confirmation of which **mParticle identity field** maps to `user_id` in your mParticle → Amplitude destination (e.g., `customerid`, `email`)
- Confirmation that the **mParticle event type** you use (likely `Other`) is forwarded to Amplitude in your destination settings

## Implementation

Place these two script blocks in `<head>`, as high as possible. The integration plugin **must** come before the Web Experiment script.


<!-- 1. mParticle integration plugin -->
<script>
window.experimentIntegration = {
  setup: function () {
    return new Promise(function (resolve) {
      if (window.mParticle && window.mParticle.isInitialized &&
          window.mParticle.isInitialized()) {
        return resolve();
      }
      var attempts = 0;
      var interval = setInterval(function () {
        attempts++;
        if (window.mParticle && window.mParticle.isInitialized &&
            window.mParticle.isInitialized()) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  },

  getUser: function () {
    var user = { device_id: window.mParticle.getDeviceId() };
    try {
      var currentUser = window.mParticle.Identity.getCurrentUser();
      if (currentUser) {
        var identities = currentUser.getUserIdentities().userIdentities;
        // Replace 'customerid' with whichever identity field maps
        // to user_id in your mParticle → Amplitude destination.
        if (identities.customerid) {
          user.user_id = identities.customerid;
        }
      }
    } catch (e) {}
    return user;
  },

  track: function (event) {
    try {
      window.mParticle.logEvent(
        event.eventType,
        window.mParticle.EventType.Other,
        event.eventProperties
      );
      return true;
    } catch (e) {
      return false;
    }
  }
};
</script>

<!-- 2. Web Experiment script (replace API_KEY) -->
<script src="https://cdn.amplitude.com/script/API_KEY.experiment.js"></script>
```

## What to Validate in Your Lower Environment

1. **Identity stitching** — After running a test experiment, check in Amplitude that `$exposure` events carry the same `user_id` / `device_id` as your analytics events from mParticle. If they don't match, experiment results won't be accurate.

2. **Event forwarding** — Confirm the mParticle event type you're using (the snippet uses `EventType.Other`) is actually forwarded to Amplitude. If it's not, exposure events silently disappear and experiment results stay empty.

3. **Flicker / timing** — Load the page and check that variant changes apply before the user sees the original content. If there's visible flicker, consider adding the [async anti-flicker snippet](https://amplitude.com/docs/web-experiment/implementation#async-script-with-anti-flicker-snippet) instead of the synchronous script.

4. **CSP headers** — If your site has Content Security Policy headers, add `*.amplitude.com` and `unsafe-inline` to `script-src`.

## One Thing to Be Aware Of

mParticle is not a first-party Web Experiment integration — the custom `IntegrationPlugin` approach above is the documented way to handle this, but I'd recommend opening a support ticket with Amplitude early in the spike so you have a direct line if anything behaves unexpectedly.

## References

- [Web Experiment implementation docs](https://amplitude.com/docs/web-experiment/implementation)
- [Set up a web experiment](https://amplitude.com/docs/web-experiment/set-up-a-web-experiment)
- [Experiment JavaScript SDK — mParticle integration](https://amplitude.com/docs/sdks/experiment-sdks/experiment-javascript)
