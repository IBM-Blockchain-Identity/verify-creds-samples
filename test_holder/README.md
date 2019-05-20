# Test Holder

The test holder is a tool for testing your issuer and verifier web pages.  It connect to an agent and performs the following tasks on a loop:

1. Check for and accept any pending connection offers.
2. Check for and accept any credential offers.
3. Respond to any pending proof requests with a proof, if possible.

## Setting up

1. Visit your agent management page and provision an agent for your test holder.
Save the password that you create for the agent; you'll need it later.

2. Get the url for your account.

    ![](Snapshot of the page where the url is)

## Building the samples

Build all the sample apps as docker images using the following command:

```
docker-compose build
```

## Running the samples

1. Setup your `.env` file with the necessary parameters to connect.
    ```
    $ cp .env_template .env
    
    # edit your .env file
    
    $ cat .env
    ACCOUNT_URL=https://my-account.example.com
    AGENT_NAME=test-holder
    AGENT_PASSWORD=test-holderpw
    ```

2. Start the test holder.
    ```
    docker-compose up -d
    ```

3. Check the logs to make sure the holder is functioning:
    ```
    ...
    test-holder_1  | My Agency ID is: test-holder
    test-holder_1  | 2019-03-18T14:39:44.878Z [holder.js] info: Connection Offers: 0
    test-holder_1  | 2019-03-18T14:39:45.152Z [holder.js] info: Credential Offers: 0
    test-holder_1  | 2019-03-18T14:39:45.413Z [holder.js] info: Verification Requests: 0
    test-holder_1  | ######################################### loop()...
    test-holder_1  | My Agency ID is: test-holder
    test-holder_1  | 2019-03-18T14:39:50.699Z [holder.js] info: Connection Offers: 0
    test-holder_1  | 2019-03-18T14:39:50.958Z [holder.js] info: Credential Offers: 0
    test-holder_1  | 2019-03-18T14:39:51.225Z [holder.js] info: Verification Requests: 0
    ...
    ```
