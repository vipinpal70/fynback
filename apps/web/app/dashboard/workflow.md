1. connect user payment gateway and try to connect with webhook for real time updates


2. fetch current month's payments from the gateway


created: The payment is created when the customer submits payment details to Razorpay. 
         The payment has not been processed yet.

authorized: The customer's payment details are successfully authenticated by the bank. 
            The amount is deducted from the customer's account but not yet settled to your account until the payment is captured. 
            There can be cases of Late Authorization where the amount is debited but the status is not received due to external factors.

captured: The authorized payment is verified to be complete by Razorpay. 
          The amount is settled to your account as per the bank's settlement schedule. 
          The captured amount must be the same as the authorized amount. 
          If not captured within 5 days, the authorization is voided and the amount refunded to the customer.


refunded: The amount has been refunded to the customer's account.

failed: The transaction was unsuccessful. The customer needs to retry the payment.


total Payments = captured + failed


we only work on failed payments
store them into database with gateway_id and gateway

categorize failed payments 
1. Insufficient funds
2. Card expired
3. UPI mandate failed
4. Do not honor
5. Network error
6. Bank decline





webhook connected
gateway's live feed
- 4 gateways per merchant 
    - razorpay
    - stripe
    - cashfree
    - payu


store redis cache for 5 hours
store database 
calcualtion -- 


worker process -- redis feed 

- start using the campaign FLOW
    -- INSERT INTO THE LIVE FEED OF EACH MERCHAT INCLUDING THE WEBHOOK FEED
    -- 


IF ANY TRANSACTION OF THE SAME USER WITH SAME AMOUNT THAT WAS FAILED



























































0. get the user merchant info from the database and store it into the redis upto 5H 

check internally if gateway connected
    - if connected then get the KPI card data
        - Card 1: Recovered MRR
            - ₹2,40,000 Recovered this month
            - +₹18,400 vs last month
            - ₹2,40,000 of ₹3,08,000 failed

        - Card 2: Failed MRR at risk
            - ₹52,800 Currently at risk
            - -₹4,200 vs last month

        - Card 3: Active campaigns
            - 3 Active campaigns
            - 143 customers in flow 

        - Card 4: Recovery Rate
            - 78% Recovery rate
            - +12% vs last month

        - Card 5: Payments processed
            - 1,847 payments this month
            - +123 vs last month



1. gateway is connected or not
    if not, show a banner to connect gateway
2. 