  /* Amplitude Web Experiment — mParticle Custom Integration sample attempt to be tested in DEV
  
  Place this BEFORE the Web Experiment script tag in <head>.
  
  Prerequisites:
    1. mParticle SDK loaded and initialized before this block runs.
    2. mParticle → Amplitude destination configured to forward the event
       type used for $exposure (verify in mParticle > Connections > Amplitude).
    3. Replace API_KEY with your Amplitude project API key.

Step 1: mParticle integration plugin (must come BEFORE the experiment script) */

<script>
window.experimentIntegration = {

  /**
   * Called once when the Web Experiment script loads.
   * Returns a promise that resolves when mParticle identity is available,
   * preventing variant assignment before we know who the user is.
   */
  setup: function () {
    return new Promise(function (resolve) {
      if (window.mParticle && window.mParticle.isInitialized &&
          window.mParticle.isInitialized()) {
        return resolve();
      }
      // Poll until mParticle is ready — keeps experiment init from racing ahead
      var attempts = 0;
      var interval = setInterval(function () {
        attempts++;
        if (window.mParticle && window.mParticle.isInitialized &&
            window.mParticle.isInitialized()) {
          clearInterval(interval);
          resolve();
        } else if (attempts > 50) {
          // Safety valve: resolve after ~5s so the page isn't blocked forever
          clearInterval(interval);
          console.warn('[Amp Experiment] mParticle did not initialize in time.');
          resolve();
        }
      }, 100);
    });
  },

  /**
   Provides user identity to the experiment engine for bucketing.
   Must return the same user_id / device_id that mParticle forwards
   to Amplitude, otherwise exposure events won't join to analytics.
   */
  
  getUser: function () {
    var user = { device_id: window.mParticle.getDeviceId() };

    try {
      var currentUser = window.mParticle.Identity.getCurrentUser();
      if (currentUser) {
        var identities = currentUser.getUserIdentities().userIdentities;
        // JPMC: adapt this to whichever identity maps to user_id in your
        // mParticle - Amplitude destination settings (customerid, email, etc.)
        if (identities.customerid) {
          user.user_id = identities.customerid;
        }
        // Optional: forward user attributes for experiment targeting rules
        var attrs = currentUser.getAllUserAttributes();
        if (attrs && Object.keys(attrs).length > 0) {
          user.user_properties = attrs;
        }
      }
    } catch (e) {
      console.warn('[Amp Experiment] Could not read mParticle identity:', e);
    }

    return user;
  },

  /**
   Routes experiment events ($exposure, impression) through mParticle
   so they reach Amplitude via the same pipeline as all other events.
   Returns true on success so the script doesn't queue retries.
   */
  track: function (event) {
    try {
      // Verify that the EventType you use here is forwarded to Amplitude
      // in your mParticle destination settings.
      window.mParticle.logEvent(
        event.eventType,
        window.mParticle.EventType.Other,
        event.eventProperties
      );
      return true;
    } catch (e) {
      console.warn('[Amp Experiment] mParticle tracking failed:', e);
      return false; // returning false tells the script to persist and retry
    }
  }
};
</script>

// Step 2: Web Experiment script (synchronous, as high in <head> as possible)
// Replace API_KEY with your Amplitude project API key
<script src="https://cdn.amplitude.com/script/API_KEY.experiment.js"></script>
/*
  Three things to verify before the spike:

  1. Which mParticle identity maps to Amplitude `user_id` in your mParticle
     -> Amplitude output config. Update the user_id line above accordingly. Getting this wrong is the top cause
     of experiments showing zero conversion.

  2. MPID vs. Amplitude Device ID mapping. Confirm in your mParticle
     Amplitude output settings; if you use a different identifier, swap
     `user.getMPID()` for that one.

  3. Deployment key comes from the Web Experiment project you created in a
     lower-env Amplitude org.

  Quick validation after install: in the browser console, run
  `__amplitudeExperiment.getUser()` and confirm `user_id` / `device_id`
  match what's on events landing in Amplitude from mParticle for the
  same session.
*/
