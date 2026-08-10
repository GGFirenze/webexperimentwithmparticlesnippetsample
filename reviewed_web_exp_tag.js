/*
  Amplitude Web Experiment — mParticle Custom Integration (JPMC)

  Place this block BEFORE the Web Experiment script tag in <head>.
  mParticle SDK must load and initialize before this runs.

  Why impressions may not appear in Amplitude even when track() logs:
    1. Event name transforms at ingestion, keyed on event TYPE, even for
       CDP-routed events. In mParticle Live Stream look for "$impression"
       (pre-transformation); in Amplitude search "[Experiment] Impression"
       (post-transformation). flag_key -> [Experiment] Flag Key, etc.
       Keep the name "$impression" so ingestion also sets the
       [Experiment] <flag_key> user property that experiment analysis needs.
    2. mParticle must forward EventType.Other custom events to Amplitude.
    3. Amplitude requires device_id OR user_id on every forwarded batch,
       and the identity is whatever mParticle's Amplitude connection maps
       (NOT what getUser() returns) — it must match the bucketing device_id.
    4. Region mismatch (US vs EU) in the mParticle -> Amplitude connection
       silently drops events.
    5. Nested event properties (e.g. metadata objects) can break forwarding.

  Quick test in browser console after page load:
    __ampExpMParticleDiagnostics()
*/

// Paste everything below inside a <script> tag in <head>, before the experiment script.
(function () {
  var DEBUG = true; // set false in production

  function log() {
    if (!DEBUG) return;
    var args = ['[Amp Experiment]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function warn() {
    var args = ['[Amp Experiment]'].concat(Array.prototype.slice.call(arguments));
    console.warn.apply(console, args);
  }

  function waitForMParticle(timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    return new Promise(function (resolve) {
      if (window.mParticle && window.mParticle.isInitialized &&
          window.mParticle.isInitialized()) {
        return resolve(true);
      }

      var attempts = 0;
      var maxAttempts = Math.ceil(timeoutMs / 100);
      var interval = setInterval(function () {
        attempts++;
        if (window.mParticle && window.mParticle.isInitialized &&
            window.mParticle.isInitialized()) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          warn('mParticle did not initialize within', timeoutMs, 'ms');
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Return only primitive impression fields.
   * mParticle -> Amplitude forwarding is more reliable without nested objects.
   */
  function flattenImpressionProperties(eventProperties) {
    var props = eventProperties || {};
    var flat = {
      flag_key: props.flag_key,
      variant: props.variant,
      time: props.time || Date.now()
    };

    if (props.experiment_key) {
      flat.experiment_key = props.experiment_key;
    }

  // Keep delivery metadata as strings if you need it for debugging.
  // Avoid forwarding the full metadata object.
    if (props.metadata) {
      flat.delivery_method = props.metadata.deliveryMethod || '';
      flat.evaluation_mode = props.metadata.evaluationMode || '';
      flat.experiment_key_meta = props.metadata.experimentKey || '';
    }

    return flat;
  }

  /**
   * Resolve the same identity mParticle will use when forwarding to Amplitude.
   * Update the user_id mapping to match your mParticle -> Amplitude connection.
   */
  function resolveExperimentUser() {
    var user = {
      device_id: window.mParticle.getDeviceId()
    };

    try {
      var currentUser = window.mParticle.Identity.getCurrentUser();
      if (!currentUser) return user;

      var identities = currentUser.getUserIdentities().userIdentities || {};

      // JPMC: change this to the identity mapped to Amplitude user_id
      // in mParticle > Connections > Amplitude > User Identification.
      if (identities.customerid) {
        user.user_id = String(identities.customerid);
      } else if (identities.email) {
        user.user_id = String(identities.email);
      }

      var attrs = currentUser.getAllUserAttributes();
      if (attrs && Object.keys(attrs).length > 0) {
        user.user_properties = attrs;
      }
    } catch (e) {
      warn('Could not read mParticle identity:', e);
    }

    return user;
  }

  /**
   * Optional but recommended when "Forward Web Requests Server Side" is enabled.
   * Ensures Amplitude receives the same device_id used for experiment bucketing.
   */
  function alignAmplitudeDeviceId() {
    try {
      var currentUser = window.mParticle.Identity.getCurrentUser();
      var deviceId = window.mParticle.getDeviceId();
      if (currentUser && deviceId) {
        currentUser.setUserAttribute('Amplitude.device_id', deviceId);
        log('Set Amplitude.device_id user attribute:', deviceId);
      }
    } catch (e) {
      warn('Could not set Amplitude.device_id:', e);
    }
  }

  window.experimentIntegration = {
    setup: function () {
      return waitForMParticle(5000).then(function (ready) {
        if (!ready) return;
        alignAmplitudeDeviceId();
      });
    },

    getUser: function () {
      return resolveExperimentUser();
    },

    track: function (event) {
      if (!window.mParticle || !window.mParticle.logEvent) {
        warn('mParticle.logEvent is unavailable');
        return false;
      }

      try {
        var eventName = event.eventType; // expected: "$impression"
        var eventProperties = flattenImpressionProperties(event.eventProperties);

        log('Forwarding impression to mParticle:', eventName, eventProperties);

        window.mParticle.logEvent(
          eventName,
          window.mParticle.EventType.Other,
          eventProperties
        );

        // Force upload in dev to reduce "I logged it but nothing arrived" confusion.
        if (DEBUG && window.mParticle.upload && typeof window.mParticle.upload === 'function') {
          window.mParticle.upload();
        }

        return true;
      } catch (e) {
        warn('mParticle tracking failed:', e);
        return false; // Web Experiment will persist and retry
      }
    }
  };

  /**
   * Run in DevTools to validate identity + send a test impression.
   *
   * Usage:
   *   __ampExpMParticleDiagnostics()
   *   __ampExpMParticleDiagnostics({ sendTestEvent: true })
   */
  window.__ampExpMParticleDiagnostics = function (options) {
    options = options || {};
    var result = {
      mParticleInitialized: !!(window.mParticle && window.mParticle.isInitialized &&
        window.mParticle.isInitialized()),
      experimentUser: null,
      deviceId: null,
      userIdentities: null,
      testEventSent: false
    };

    if (!result.mParticleInitialized) {
      warn('mParticle is not initialized');
      return result;
    }

    result.deviceId = window.mParticle.getDeviceId();
    result.experimentUser = resolveExperimentUser();

    try {
      var currentUser = window.mParticle.Identity.getCurrentUser();
      if (currentUser) {
        result.userIdentities = currentUser.getUserIdentities().userIdentities;
      }
    } catch (e) {
      result.identityError = String(e);
    }

    log('Diagnostics:', result);

    if (options.sendTestEvent) {
      window.mParticle.logEvent(
        '$impression',
        window.mParticle.EventType.Other,
        {
          flag_key: 'diagnostic-test-flag',
          variant: 'diagnostic-test-variant',
          experiment_key: 'diagnostic-test-exp',
          time: Date.now(),
          source: 'amp-exp-diagnostics'
        }
      );
      if (window.mParticle.upload) window.mParticle.upload();
      result.testEventSent = true;
      log('Sent diagnostic $impression. Check mParticle Live Stream, then Amplitude.');
    }

    return result;
  };
})();

/*
  STEP 2 — add this script tag immediately after the block above
  (synchronous, as high in <head> as possible).
  Replace API_KEY with your Amplitude project API key:

  <script src="https://cdn.amplitude.com/script/API_KEY.experiment.js"></script>

  VALIDATION CHECKLIST (do these in order)

  1) Confirm track() fires (you already did this)
     - Console should show: [Amp Experiment] Forwarding impression to mParticle: $impression ...

  2) Confirm mParticle received the event
     - mParticle UI > Activity > Live Stream
     - Look for event name: $impression
     - If missing here, the issue is before Amplitude (integration code / mParticle init)

  3) Confirm mParticle forwards custom events to Amplitude
     - mParticle > Connections > Amplitude > Event Filtering
     - Ensure EventType.Other / custom events are NOT blocked
     - If "Forward Web Requests Server Side" is ON:
         * user_id must be present on the batch, OR
         * set Amplitude.device_id user attribute (handled in setup() above)

  4) Confirm event lands in Amplitude
     - User Lookup or Event Segmentation
     - Search event name: [Experiment] Impression   <-- post-transformation name
       ($impression is only the pre-transformation name seen in mParticle)
     - Filter by device_id from __ampExpMParticleDiagnostics().deviceId
     - Allow 2-5 minutes for ingestion
     - Confirm the [Experiment] <flag_key> user property gets set on the user
       (User Lookup). No user property = experiment analysis stays empty.

  5) Confirm identity alignment for experiment analysis
     - Run: __amplitudeExperiment.getUser()
     - Compare user_id / device_id with a normal mParticle event in Amplitude
       for the same browser session
     - Mismatched IDs = impressions exist but won't join to conversions

  6) One-click diagnostic test
     __ampExpMParticleDiagnostics({ sendTestEvent: true })

  COMMON ROOT CAUSES
  - Searching Amplitude for "$impression" instead of "[Experiment] Impression"
    (in-app data exists, but under the transformed name)
  - mParticle data filter blocks "$impression" or EventType.Other
  - No valid Amplitude user_id/device_id on forwarded batch (anonymous users)
  - Forwarded device_id/user_id doesn't match the bucketing identity, so
    impressions never join to conversions -> experiment analysis stays empty
  - Amplitude Kit missing (self-hosted mParticle SDK without Amplitude kit)
  - Wrong Amplitude project / region (US vs EU) in mParticle connection settings
*/
