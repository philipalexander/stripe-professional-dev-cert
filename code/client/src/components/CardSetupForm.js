import {
  PaymentElement, useElements, useStripe
} from "@stripe/react-stripe-js";
import React, { useState } from "react";
import SignupComplete from "./SignupComplete";
  
  const CardSetupForm = (props) => {
    const { selected, mode, details, customerId, learnerEmail, learnerName, onSuccessfulConfirmation } =
      props;
    const [paymentSucceeded, setPaymentSucceeded] = useState(false);
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [last4, setLast4] = useState("");
    // TODO: Integrate Stripe
    const stripe = useStripe();
    const elements = useElements();
  

    const getPaymentMethod = async (id) => {
      try {
       const res = await fetch(`/payment-methods/${id}`, {
          method: "GET",
          mode: 'cors',
          headers: { "Content-Type": "application/json" },
        })
        const json_res = await res.json();
        return json_res;
      } catch (error) {
        setError(JSON.stringify(error))
        console.error('caught error', error)
      }
    }

    const handleClick = async (e) => {
      // TODO: Integrate Stripe
      e.preventDefault();
      if (!stripe || !elements) {
        // Stripe.js hasn't yet loaded.
        // Make sure to disable form submission until Stripe.js has loaded.
        console.log('stripe not loaded')
        return;
      }
      setProcessing(true)
      // Trigger form validation and wallet collection
      const {error: submitError} = await elements.submit();

      if (submitError) {
        setError(JSON.stringify(submitError))
        console.error('submitError', submitError)
        setProcessing(false)
        return;
      }

      // Use the clientSecret and Elements instance to confirm the setup
      const {setupIntent, error} = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: 'https://example.com/order/123/complete',
        },
        // Uncomment below if you only want redirect for redirect-based payments
        redirect: "if_required",
      });
      
      if (error) {
        console.error('error', error)
        setError(error.message)
        setProcessing(false)
        return;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Get last 4 digits, set metadata of first lesson
        const payment_method = await getPaymentMethod(setupIntent.payment_method)
        setLast4(payment_method.card.last4)
        setPaymentSucceeded(true)
        setProcessing(false)
        if (onSuccessfulConfirmation) onSuccessfulConfirmation(setupIntent.customer);        
      }
      setProcessing(false)
    };
  
    if (selected === -1) return null;
    if (paymentSucceeded) return (
      <div className={`lesson-form`}>
        <SignupComplete
          active={paymentSucceeded}
          email={learnerEmail}
          last4={last4}
          customer_id={customerId}
        />
      </div>
    )
    return (
      // The actual checkout form, inside the !paymentSucceeded clause
        <div className={`lesson-form`}>
            <div className={`lesson-desc`}>
              <h3>Registration details</h3>
              <div id="summary-table" className="lesson-info">
                {details}
              </div>
              <div className="lesson-legal-info">
                Your card will not be charged. By registering, you hold a session
                slot which we will confirm within 24 hrs.
              </div>
              <div className="lesson-grid">
                <div className="lesson-inputs">
                  <div className="lesson-input-box first">
                    <span>{learnerName} ({learnerEmail})</span>
                  </div>
                  <div className="lesson-payment-element">
                    {
                      // TODO: Integrate Stripe
                    <form onSubmit={handleClick}>
                      <PaymentElement />
                      <button disabled={processing} id="submit" stype="submit">
                        {processing ? (
                          <div className="spinner" id="spinner"></div>
                        ) : "Submit"}
                      </button>
                    </form>
                    }
                  </div>
                </div>
              </div>
              {error && (
                <div className="sr-field-error" id="card-errors" role="alert">
                  <div className="card-error" role="alert">
                    {error}
                  </div>
                </div>
              )}
            </div>
        </div>
    )
  };
  export default CardSetupForm;
  
