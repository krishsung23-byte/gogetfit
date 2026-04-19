/**
 * Robust API Request Handler for 503 MODEL_CAPACITY_EXHAUSTED
 * Implements Exponential Backoff, Request Queuing, and Model Cascade
 */

class ApiManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    
    // Priority Fallback Chain
    this.models = [
      'gemini-3.1-pro-high', // Primary
      'gemini-3.1-pro',      // Fallback 1
      'gemini-3.1-flash'     // Last Resort
    ];
  }

  // --- 1. Request Queue System ---
  async enqueueRequest(payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift(); // Process Sequentially
      try {
        const result = await this.executeWithRetry(request.payload);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }
    
    this.isProcessing = false;
  }

  // --- 2. Exponential Backoff & Fallback Logic ---
  async executeWithRetry(payload) {
    const maxRetries = 5;
    let currentModelIndex = 0;
    let attempt = 0;

    // Helper for async delays
    const delay = ms => new Promise(res => setTimeout(res, ms));

    while (currentModelIndex < this.models.length) {
      const activeModel = this.models[currentModelIndex];
      attempt = 0;

      while (attempt < maxRetries) {
        attempt++;
        try {
          
          this.logEvent("ATTEMPT", `Sending request via ${activeModel} (Attempt ${attempt}/${maxRetries})`);
          
          // --- Mock API Call (Replace with real fetch) ---
          const response = await this.mockNetworkCall(payload, activeModel);
          return response;

        } catch (error) {
          if (error.status === 503 && error.reason === 'MODEL_CAPACITY_EXHAUSTED') {
            
            // Calculate Exponential Backoff: 10s, 20s, 40s
            const waitTimeSeconds = 10 * Math.pow(2, attempt - 1);
            
            this.logEvent("503_ERROR", `Capacity Exhausted on ${activeModel}`);
            
            // Yield Structured Error Response via callback/console
            const statusYield = {
              "status": "retrying",
              "reason": "model capacity exhausted",
              "retry_in_seconds": waitTimeSeconds,
              "fallback_available": currentModelIndex < this.models.length - 1
            };
            console.log(JSON.stringify(statusYield, null, 2));

            if (attempt < maxRetries) {
              this.logEvent("WAITING", `Sleeping for ${waitTimeSeconds}s before retry...`);
              await delay(waitTimeSeconds * 1000); // Wait exponentially
            } else {
              this.logEvent("MAX_RETRIES", `Exhausted all 5 retries for ${activeModel}.`);
              break; // Break inner loop, trigger model fallback
            }
          } else {
            // Unhandled error (not 503), throw immediately
            throw error;
          }
        }
      }

      // --- 3. Model Fallback Switch ---
      currentModelIndex++;
      if (currentModelIndex < this.models.length) {
        this.logEvent("FALLBACK", `Switching to fallback model: ${this.models[currentModelIndex]}`);
      }
    }

    throw new Error("CRITICAL: All models and retries exhausted.");
  }

  // --- 4. Logging & Utilities ---
  logEvent(type, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type,
      message: message
    };
    console.log(`[${logEntry.timestamp}] [${logEntry.type}] ${logEntry.message}`);
  }

  // --- 5. Payload Optimization ---
  optimizePayload(prompt) {
    // Basic optimization rules to reduce request size
    let cleaned = prompt.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 5000) {
      this.logEvent("OPTIMIZE", "Prompt too large, applying strict truncation/chunking.");
      cleaned = cleaned.substring(0, 5000) + "... [TRUNCATED]";
    }
    return cleaned;
  }

  // Mock function to simulate the 503 error for testing
  async mockNetworkCall(payload, model) {
    // Simulate network delay
    await new Promise(res => setTimeout(res, 500));
    
    // Force a 503 error to demonstrate the backoff and fallback
    throw {
      status: 503,
      reason: "MODEL_CAPACITY_EXHAUSTED",
      model: model
    };
  }
}

// Export for usage
// module.exports = new ApiManager();

// Example Usage:
// const api = new ApiManager();
// api.enqueueRequest("Analyze this complex dataset...");
