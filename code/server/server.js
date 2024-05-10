/* eslint-disable no-console */
const express = require('express');

const app = express();
const { resolve } = require('path');
// Replace if using a different env file or config
require('dotenv').config({ path: './.env' });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const allitems = {};
const fs = require('fs');

app.use(express.static(process.env.STATIC_DIR));

app.use(
  express.json(
    {
      // Should use middleware or a function to compute it only when
      // hitting the Stripe webhook endpoint.
      verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/webhook')) {
          req.rawBody = buf.toString();
        }
      },
    },
  ),
);
app.use(cors({ origin: true }));

// const asyncMiddleware = fn => (req, res, next) => {
//   Promise.resolve(fn(req, res, next)).catch(next);
// };

app.post("/webhook", async (req, res) => {
  // TODO: Integrate Stripe
});

// Routes
app.get('/', (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/index.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve('./public/static-file-error.html');
    res.sendFile(path);
  }
});

// Fetch the Stripe publishable key
//
// Example call:
// curl -X GET http://localhost:4242/config \
//
// Returns: a JSON response of the pubblishable key
//   {
//        key: <STRIPE_PUBLISHABLE_KEY>
//   }
app.get("/config", (req, res) => {
  // TODO: Integrate Stripe
  try {
    const stripe_public_key = process.env.STRIPE_PUBLISHABLE_KEY
    res.send({key: stripe_public_key})
  } catch (error) {
    res.status(500).send(error)
  }
});

// Milestone 1: Signing up
// Shows the lesson sign up page.
app.get('/lessons', (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/lessons.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve('./public/static-file-error.html');
    res.sendFile(path);
  }
});

const saveToFile = function (content) {
  fs.appendFile('./testing.txt', content + '\n', { flag: 'a+' }, err => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });
}

// Receive the signup information from the registration page,
// We should have a name, email, and first lesson date
// We'll then create a customer and a Setup Intent that we'll use to collect a payment method.
// Then, return the setup intent
app.post('/lessons', async (req, res) => {
  try {
    const body = req.body;
    // Here is the problem I ran into. I was able to prove the data freshness issue on search. Then I found this article https://stripe.com/docs/search#data-freshness
    // saveToFile(`email:  ${body.email} `)
    // const existing_customer = await stripe.customers.search({
    //   query: `email:\'${body.email}\'`,
    // });
    // saveToFile(`existing_customer: ${JSON.stringify(existing_customer.data)} `)
    // 
    const existing_customer = await stripe.customers.list({email: body.email});
    if (existing_customer.data.length > 0) {
      res.status(400).send({existing_customer: existing_customer.data[0], error: 'Customer email already exists!'})
      return;
    }
    const customer = await stripe.customers.create({name: body.name, email: body.email, metadata: {first_lesson: body.lesson_details}});
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ['card'], // maybe use automatic_payment_methods to auto detect relevant methods
      customer: customer.id
    });
    res.send(setupIntent)
  } catch (error) {
    res.status(500).send(error)
  }
});

app.get('/payment-methods/:method_id', async(req, res) => {
  try {
    const payment_method_id = req.params.method_id;
    const paymentMethod = await stripe.paymentMethods.retrieve( payment_method_id );
    const customer = await stripe.customers.retrieve(paymentMethod.customer);
    const result = await stripe.paymentMethods.update( payment_method_id, {billing_details: {email: customer.email, name: customer.name}} )
    res.send(result)
  } catch (error) {
    res.status(500).send(error)
  }
})

// TODO: Integrate Stripe

// Milestone 2: '/schedule-lesson'
// Authorize a payment for a lesson
//
// Parameters:
// customer_id: id of the customer
// amount: amount of the lesson in cents
// description: a description of this lesson
//
// Example call:
// curl -X POST http://localhost:4242/schedule-lesson \
//  -d customer_id=cus_GlY8vzEaWTFmps \
//  -d amount=4500 \
//  -d description='Lesson on Feb 25th'
//
// Returns: a JSON response of one of the following forms:
// For a successful payment, return the Payment Intent:
//   {
//        payment: <payment_intent>
//    }
//
// For errors:
//  {
//    error:
//       code: the code returned from the Stripe error if there was one
//       message: the message returned from the Stripe error. if no payment method was
//         found for that customer return an msg 'no payment methods found for <customer_id>'
//    payment_intent_id: if a payment intent was created but not successfully authorized
// }
app.post("/schedule-lesson", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const {customer_id, amount, description} = req.body;
    const paymentMethods = await stripe.customers.listPaymentMethods( customer_id, { limit: 3 } );
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      customer: customer_id,
      description: description,
      metadata: {type: 'lessons-payment'},
      capture_method: 'manual',
    });

    const confirmedPaymentIntent = await stripe.paymentIntents.confirm(
      paymentIntent.id,
      {
        payment_method:  paymentMethods.data[0].id,
        return_url: 'https://www.example.com',
      }
    );
    res.send({payment: confirmedPaymentIntent})
  } catch (error) {
    console.log('error', error)
    const error_obj = {code: error.code, message: error.message}
    res.status(400).send({error: error_obj})
  }
});


// Milestone 2: '/complete-lesson-payment'
// Capture a payment for a lesson.
//
// Parameters:
// amount: (optional) amount to capture if different than the original amount authorized
//
// Example call:
// curl -X POST http://localhost:4242/complete_lesson_payment \
//  -d payment_intent_id=pi_XXX \
//  -d amount=4500
//
// Returns: a JSON response of one of the following forms:
//
// For a successful payment, return the payment intent:
//   {
//        payment: <payment_intent>
//    }
//
// for errors:
//  {
//    error:
//       code: the code returned from the error
//       message: the message returned from the error from Stripe
// }
//
app.post("/complete-lesson-payment", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const {payment_intent_id, amount} = req.body;
    const options = amount ? {amount_to_capture: amount} : {}
    const paymentIntent = await stripe.paymentIntents.capture(
      payment_intent_id,
      options
    );
    res.send({payment: paymentIntent})
  } catch (error) {
    console.log('error', error)
    const error_obj = {code: error.code, message: error.message}
    res.status(400).send({error: error_obj})
  }
});

// Milestone 2: '/refund-lesson'
// Refunds a lesson payment.  Refund the payment from the customer (or cancel the auth
// if a payment hasn't occurred).
// Sets the refund reason to 'requested_by_customer'
//
// Parameters:
// payment_intent_id: the payment intent to refund
// amount: (optional) amount to refund if different than the original payment
//
// Example call:
// curl -X POST http://localhost:4242/refund-lesson \
//   -d payment_intent_id=pi_XXX \
//   -d amount=2500
//
// Returns
// If the refund is successfully created returns a JSON response of the format:
//
// {
//   refund: refund.id
// }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
app.post("/refund-lesson", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const {payment_intent_id, amount} = req.body;
    const paymentIntent = await stripe.paymentIntents.retrieve( payment_intent_id );

    const refund = await stripe.refunds.create({
      charge: paymentIntent.latest_charge,
    });
    res.send({refund: refund.id})
  } catch (error) {
    console.log('error', error)
    const error_obj = {code: error.code, message: error.message}
    res.status(400).send({error: error_obj})
  }
  
});

// Milestone 3: Managing account info
// Displays the account update page for a given customer
app.get("/account-update/:customer_id", async (req, res) => {
  try {
    const path = resolve(`${process.env.STATIC_DIR}/account-update.html`);
    if (!fs.existsSync(path)) throw Error();
    res.sendFile(path);
  } catch (error) {
    const path = resolve('./public/static-file-error.html');
    res.sendFile(path);
  }
});

app.get("/payment-method/:customer_id", async (req, res) => {
  // TODO: Retrieve the customer's payment method for the client
  try {
    const customerId = req.params.customer_id;
    const paymentMethods = await stripe.customers.listPaymentMethods(
      customerId,
      {
        limit: 3,
        expand: ['data.customer']
      }
    );
    res.send(paymentMethods.data[0])
  } catch (error) {
    console.log('error', error)
    const error_obj = {code: error.code, message: error.message}
    res.status(400).send({error: error_obj})
  }
});


app.post("/update-payment-details/:customer_id", async (req, res) => {
  // TODO: Update the customer's payment details
  try {
    const customerId = req.params.customer_id;
    const name = req.body.name;
    const email = req.body.email;
    const customer = await stripe.customers.retrieve(customerId);

    let updateCustomerNeeded = false;

    if (customer.email === email || customer.name === name) {
      updateCustomerNeeded = true;
    }

    if (!(customer.email === email)) {
      // https://stripe.com/docs/search#data-freshness
      const existing_customer = await stripe.customers.list({email});

      if (!(existing_customer.data.length === 0)) {
        res.status(400).send({error: 'Customer email already exists!'})
        return;
      }
    }

    if (updateCustomerNeeded) {
      const updatedCustomer = stripe.customers.update(customerId, {name, email})
      const paymentMethods = await stripe.customers.listPaymentMethods( customerId, { limit: 3, } );
      const paymentMethod = paymentMethods.data[0];
      await stripe.paymentMethods.update( paymentMethod.id, {billing_details: {name, email}} )
    }
    
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ['card'],
      customer: customerId
    });
    res.send(setupIntent)
  } catch (error) {
    res.status(500).send(error)
  }
});

// Handle account updates
app.post("/account-update", async (req, res) => {
  // TODO: Handle updates to any of the customer's account details
  // try {
  //   const customerId = req.body.customerId;
  //   let propToUpdate = null;
  //   req.body.name ? propToUpdate.name = req.body.name: null;
  //   req.body.email ? propToUpdate.email = req.body.email: null;

  //   const customer = await stripe.customers.retrieve(customerId);
  //   if (!(email === customer.email)) {
  //     // saveToFile(`email:  ${body.email} `)
  //     const existing_customer = await stripe.customers.search({
  //       query: `email:\'${body.email}\'`,
  //     });
  //     // saveToFile(`existing_customer: ${JSON.stringify(existing_customer.data)} `)

  //     if (!(existing_customer.data.length === 0)) {
  //       res.status(400).send({existing_customer: existing_customer.data[0], error: 'Customer email already exists!'})
  //       return;
  //     }
  //   }
  //   const updatedCustomer = stripe.customers.update(customerId, {email, name})
  //   const paymentMethods = await stripe.customers.listPaymentMethods( customerId, { limit: 3, } );
  //   const paymentMethod = paymentMethods.data[0];
  //   const result = await stripe.paymentMethods.update( paymentMethod.id, {billing_details: {email, name}} )
  //   res.send(updatedCustomer)
  // } catch (error) {
  //   res.status(500).send(error)
  // }
  
});

// Milestone 3: '/delete-account'
// Deletes a customer object if there are no uncaptured payment intents for them.
//
// Parameters:
//   customer_id: the id of the customer to delete
//
// Example request
//   curl -X POST http://localhost:4242/delete-account/:customer_id \
//
// Returns 1 of 3 responses:
// If the customer had no uncaptured charges and was successfully deleted returns the response:
//   {
//        deleted: true
//   }
//
// If the customer had uncaptured payment intents, return a list of the payment intent ids:
//   {
//     uncaptured_payments: ids of any uncaptured payment intents
//   }
//
// If there was an error:
//  {
//    error: {
//        code: e.error.code,
//        message: e.error.message
//      }
//  }
//
app.post("/delete-account/:customer_id", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const customerId = req.params.customer_id;
    const paymentIntents = await stripe.paymentIntents.list({customer: customerId, limit: 100});
    const uncapturedPaymentIntents = paymentIntents.data.flatMap(pi => {
      if (pi.status === "requires_capture") {return pi.id}
      else { return [] }
    })

    if (uncapturedPaymentIntents.length > 0) {
      res.send({uncaptured_payments: uncapturedPaymentIntents});
    } else {
      await stripe.customers.del(customerId);
      res.send({deleted: true})
    }
  } catch (error) {
    res.status(500).send(error)
  }
});


// Milestone 4: '/calculate-lesson-total'
// Returns the total amounts for payments for lessons, ignoring payments
// for videos and concert tickets, ranging over the last 36 hours.
//
// Example call: curl -X GET http://localhost:4242/calculate-lesson-total
//
// Returns a JSON response of the format:
// {
//      payment_total: Total before fees and refunds (including disputes), and excluding payments
//         that haven't yet been captured.
//      fee_total: Total amount in fees that the store has paid to Stripe
//      net_total: Total amount the store has collected from payments, minus their fees.
// }
//

async function getFullBalanceTransactionsData(createdBefore, startingAfter) {
  try {
    let options = {
      limit: 3,
      created: { gte: createdBefore },
    }
    startingAfter ? options.starting_after = startingAfter : null;
    const balanceTransactionsRes = await stripe.balanceTransactions.list(options);
    if (balanceTransactionsRes.has_more) {
      const more = await getFullBalanceTransactionsData(createdBefore, balanceTransactionsRes.data[balanceTransactionsRes.data.length - 1].id)
      balanceTransactionsRes.data.push(...more.data)
      balanceTransactionsRes.hasMore = false;
    }
    return balanceTransactionsRes;
  } catch(error) {
    res.status(500).send(error)
  }
}

app.get("/calculate-lesson-total", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const date = new Date(new Date().getTime() - (36 * 60 * 60 * 1000));
    const fullBalanceTransactionsList = await getFullBalanceTransactionsData(date);
    const totals = fullBalanceTransactionsList.data.reduce((acc, current) => {
      return { 
        revenue: acc.revenue + current.amount, 
        fees: acc.fees + current.fee
      }
    }, { revenue: 0, fees: 0 })
    
    res.send({
      payment_total: totals.revenue,
      fee_total: totals.fees,
      net_total: totals.revenue - totals.fees
    });
  } catch (error) {
    res.status(500).send(error)
  }
});


// Milestone 4: '/find-customers-with-failed-payments'
// Returns any customer who meets the following conditions:
// The last attempt to make a payment for that customer failed.
// The payment method associated with that customer is the same payment method used
// for the failed payment, in other words, the customer has not yet supplied a new payment method.
//
// Example request: curl -X GET http://localhost:4242/find-customers-with-failed-payments
//
// Returns a JSON response with information about each customer identified and
// their associated last payment
// attempt and, info about the payment method on file.
// [
//   {
//     customer: {
//       id: customer.id,
//       email: customer.email,
//       name: customer.name,
//     },
//     payment_intent: {
//       created: created timestamp for the payment intent
//       description: description from the payment intent
//       status: the status of the payment intent
//       error: the reason that the payment attempt was declined
//     },
//     payment_method: {
//       last4: last four of the card stored on the customer
//       brand: brand of the card stored on the customer
//     }
//   },
//   {},
//   {},
// ]

async function getFullPaymentIntentListData(createdBefore, startingAfter) {
  try {
    let options = {
      limit: 100,
      created: { gte: createdBefore },
    }
    startingAfter ? options.starting_after = startingAfter : null;
    const paymentIntentRes = await stripe.paymentIntents.list(options);
    if (paymentIntentRes.has_more) {
      const more = await getFullPaymentIntentListData(createdBefore, paymentIntentRes.data[paymentIntentRes.data.length - 1].id)
      paymentIntentRes.data.push(...more.data)
      paymentIntentRes.hasMore = false;
    }
    return paymentIntentRes;
  } catch(error) {
    res.status(500).send(error)
  }
}

app.get("/find-customers-with-failed-payments", async (req, res) => {
  // TODO: Integrate Stripe
  try {
    const date = new Date(new Date().getTime() - (36 * 60 * 60 * 1000));
    const fullPaymentIntentList = await getFullPaymentIntentListData(date)
    let erroredCustomerPayments = [];
    for (const pi of fullPaymentIntentList.data) {
      if (pi.status === "requires_payment_method" && pi.last_payment_error) {
        const paymentMethods = await stripe.customers.listPaymentMethods( pi.customer, { limit: 3 } );
        if (pi.last_payment_error.payment_method && pi.last_payment_error.payment_method.id === paymentMethods.data[0].id) {
          const customer = await stripe.customers.retrieve(pi.customer);
          erroredCustomerPayments.push({
            customer: { id: customer.id, email: customer.email, name: customer.name },
            payment_intent: {
              created: pi.created,
              description: pi.description,
              status: 'failed',
              error: pi.last_payment_error.decline_code
            },
            payment_method: { last4: paymentMethods.data[0].card.last4, brand: paymentMethods.data[0].card.brand }
          });
        }
      }
    }   
    res.send(erroredCustomerPayments);
  } catch (error) {
    console.log("ERROR", error)
    res.status(500).send(error)
  }
});

function errorHandler(err, req, res, next) {
  res.status(500).send({ error: { message: err.message } });
}

app.use(errorHandler);

app.listen(4242, () => console.log(`Node server listening on port http://localhost:${4242}`));
