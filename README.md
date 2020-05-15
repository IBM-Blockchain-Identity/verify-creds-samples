# verify-creds-samples

Play with these samples to learn how to integrate the [openssi-websdk](https://github.com/IBM-Blockchain-Identity/openssi-websdk) into your own website.

For more information on the project surrounding these samples, take a look at [our docs](https://docs.info.verify-creds.com/).

## Try it out

We've provided some live samples that you can play with without needing to download or build any code.  Use these if
you're going through these demos for the first time.

- [Gov DMV](https://gov.livedemo.verify-creds.com)
- [IBM HR](https://employer.livedemo.verify-creds.com)
- [Big Blue Credit Union](https://bbcu.livedemo.verify-creds.com)

### Passwordless Authentication

Several institutions, including a fictional DMV called Gov DMV and a fictional company called IBM, have begun issuing
verifiable credentials.  Gov DMV requires customers to show up at a physical location with traditional, paper-based
documents to verify their identity before they can be issued a credential.  IBM's HR department performs background
checks to determine whether their prospective employees are who they claim to be.  Both institutions are investing time
and resources to ensure the digital credentials they issue are trustworthy.

Big Blue Credit Union has decided to take advantage of these investments to reduce KYC costs when creating new accounts
at their bank.  They allow new customers to sign up for checking accounts on their website, using credentials issued by
institutions such as Gov DMV and IBM.  Once customers have an account at BBCU, they can use a credential issued by BBCU
to sign in to their online banking portal without the need to type in a password.
  
You will be able to see this process in action by following the instructions below:

- [Part 1: Issuing a driver's license](gov-dmv/README.md#part-1-issuing-a-drivers-license)
- [Part 2: Issuing an employee badge](ibm-hr/README.md#part-2-issuing-proof-of-employment)
- [Part 3: Signing up for a bank account](bbcu/README.md#part-3-signing-up-for-a-bank-account)
- [Part 4: Logging in using your bank account credential](bbcu/README.md#part-4-signing-in-using-verifiable-credentials)

### P2P Verification

Verifiable credentials aren't just useful for interactions between businesses and consumers.  In the demos below, you'll
see how end-users can exchange verifiable information with each other.

- [Demo 1: Ordering a drink](peer-to-peer/README.md#demo-1-ordering-a-drink)
- [Demo 2: Providing multiple forms of ID](peer-to-peer/README.md#demo-2-providing-multiple-forms-of-id)


## Developing your own samples

The code used to run the samples you played with above is included, in its entirety, in this repository.  You can quickly
build your own sample websites from the templates we've provided.

### Setting up

1. Visit your agent account management page and provision three new agents, `govdmv`, `ibmhr`, and `bbcu`.  Make sure the
box marking the new agents as issuers is checked.

2. Find your account url and record the passwords for the three agents that you created.  You can find this information
by visiting your account dashboard, clicking on each agent, clicking the `Add Device` on the `General` page for the agent,
and clicking on `Manual Entry` in the `Register Device` popup panel.

3. Make sure all of your agents are capable of issuing credentials.  You can determine this via one of two methods:
    1. Open the account dashboard, click on the agent, and check the `Agent Role` under the `General` page.
        ```
        Agent Name: govdmv
        Agent DID: WpAsRjUvWNdJhgcpcir1TL
        Agent Role: Issuer
        ```
    2. Use curl to check the agent's `role`, making sure it is set to `TRUST_ANCHOR`.  Use this curl command to check the
    agent's role:
        ```
        curl -u <agent_name>:<agent_password> <account_url>/api/v1/info
        ```
4. If any of the agents are not issuers, use the following `curl` command to update their role:
    ```
    curl -u <account_admin_agent_name>:<account_admin_agent_password> -X PATCH \
        <account_url>/api/v1/identities/<agent_name> \
        -H 'Content-Type: application/json' \
        -d '{ "role": "TRUST_ANCHOR" }'
    ```

5. Install...
    - [the Verify Creds mobile app](https://docs.info.verify-creds.com/explore/mobile_app/).
    OR
    - [the Verify Creds browser extension](https://docs.info.verify-creds.com/explore/browser_extension/).

### Building the samples

Build all the sample apps as docker images using the following command:

```
docker-compose build
```

### Running the samples

1. Setup your `.env` file with the necessary parameters to connect.  The account url value can be found in your welcome email or
by visiting your account dashboard, clicking on an agent, clicking the `Add Device` on the `General` page for the agent,
and clicking on `Manual Entry` in the `Register Device` popup panel.
    ```
    $ cp .env_template .env
    
    # edit your .env file
    
    $ cat .env
    ACCOUNT_URL=https://my-account.example.com
    
    DMV_AGENT_NAME=govdmv
    DMV_AGENT_PASSWORD=****
    
    IBMHR_AGENT_NAME=ibmhr
    IBMHR_AGENT_PASSWORD=****
    
    BBCU_AGENT_NAME=bbcu
    BBCU_AGENT_PASSWORD=****

    COUCHDB_USER_NAME=****
    COUCHDB_USER_PASSWORD=****
    ```

    *Note:* If you have previously run these samples, the COUCHDB_xxx values need to reflect those of your current couch database.  The default values used to be admin/password.  If you can no longer remember the credentials for your couch database, you can always remove the `couchdb` directory and restart the container using `docker-compose build couchdb && docker-compose up -d couchdb`.

2. Start the issuers.
    ```
    docker-compose up -d
    ```

3. Browse to the localhost urls for the various issuers.
    - [Gov DMV](http://localhost:8090)
    - [IBM HR](http://localhost:8091)
    - [BBCU](http://localhost:8092)
    
4. Read the setup documentation for each app.
    - [Gov DMV](gov-dmv/README.md#development)
    - [IBM HR](ibm-hr/README.md#development)
    - [BBCU](bbcu/README.md#development)

4. Browse to the [CouchDB UI](http://localhost:5984/_utils) to see what the apps are writing to the database.

### Troubleshooting

If you don't see your apps running or they don't appear to be functioning properly, you can view the logs for the apps
to obtain more information:
```
$ docker ps
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS                                        NAMES
5e878312417f        bbcu              "/bin/sh -c 'npm sta…"   5 seconds ago       Up 3 seconds        0.0.0.0:8092->3000/tcp                       verify-creds-samples_bbcu_1
8b82caa94b2f        gov-dmv             "/bin/sh -c 'npm sta…"   4 minutes ago       Up 3 seconds        0.0.0.0:8090->3000/tcp                       verify-creds-samples_dmv_1
2b97afa23e47        ibm-hr              "/bin/sh -c 'npm sta…"   4 minutes ago       Up 3 seconds        0.0.0.0:8091->3000/tcp                       verify-creds-samples_ibm-hr_1
63fd208de010        couchdb             "tini -- /docker-ent…"   10 minutes ago      Up 10 minutes       4369/tcp, 9100/tcp, 0.0.0.0:5984->5984/tcp   verify-creds-samples_couchdb_1

$ docker logs verify-creds-samples_bbcu_1 

> bbcu-bank@0.0.0 start /opt/app
> node ./bin/www.js

2019-03-13T12:45:45.669Z [bin/www.js] info: Connecting to couchdb.  Attempt 1 out of 10
2019-03-13T12:45:45.922Z [bin/www.js] info: Connected to couchdb: "{\"couchdb\":\"Welcome\",\"version\":\"2.3.0\",\"git_sha\":\"07ea0c7\",\"uuid\":\"0c06c8cdfd26a14f8aa9f0cad15e46a4\",\"features\":[\"pluggable-storage-engines\",\"scheduler\"],\"vendor\":{\"name\":\"The Apache Software Foundation\"}}\n"
2019-03-13T12:45:45.929Z [app.js] debug: Setting up express app
2019-03-13T12:45:45.938Z [app.js] info: Initializing agent
2019-03-13T12:45:45.979Z [app.js] info: Attempting to create database bbcu_db
2019-03-13T12:45:46.001Z [bin/www.js] info: Listening on port 3000
2019-03-13T12:45:46.476Z [app.js] info: Created database bbcu_db
2019-03-13T12:45:46.477Z [libs/users.js] info: Publishing Users design doc
2019-03-13T12:45:46.586Z [libs/users.js] debug: Users design doc published. rev: 1-7ba3f412031b58ad8a8bd6c6fa96c40d
...
```

### Developer Tools

- [Test Holder instructions](test_holder/README.md)

### Sample App Configuration Parameters

There are several different parameters that are used to make the sample apps do what they do.  You'll probably need to add,
remove, or tweak these values in order to transform the samples into your own proof-of-concept application.  Here's a complete
list of the existing configuration parameters:

- `DB_CONNECTION_STRING`: The Couchdb service endpoint that the sample app will use to store user records.
  `http://couchdb:5984` in the Docker Compose file is what allows the samples to use the `couchdb` container in the Docker
  Compose environment.
- `DB_USERS`: The name of the Couchdb database where user records will be stored.  If the database is not present, the
  app will attempt to create it at startup. ex. `dmv_db`
- `ACCOUNT_URL`: The URL that is assigned to an account on our Public Agency and associated with a single IBMid.  The
  issuer agent should be registered under this account url. ex. `https://<account_uuid>.staging-cloud-agents.us-east.containers.appdomain.cloud/`
- `AGENT_NAME`: The name of the issuer agent on the Public Agency account. ex. `dmv`
- `AGENT_PASSWORD`: The password associate with the issuer agent.
- `FRIENDLY_NAME`: The friendly name to attach to connection offers, credential offers, verification requests, etc. If
  not provided, the issuer's agent name will be used. ex. `Big Blue Credit Union`
- `AGENT_LOG_LEVEL`: The log level to set for the `openssi-websdk`.  Defaults to `info`.
- `AGENT_ADMIN_NAME`: The agent name for the first agent on your Public Agency account.  These agent credentials are used
  to create the issuer agent if it doesn't already exist.  Due to performance issues with creating agents, using these
  parameters is not recommended or supported.
- `AGENT_ADMIN_PASSWORD`: The password for the admin agent.
- `CARD_IMAGE_RENDERING`: The type of rendering that should be used for credentials.  Credential rendering only comes
  into play when the issuer's credential schema has `card_front` and/or `card_back` attributes.  The available options are
  described below:
  - `none`: No credential rendering is performed and the image attributes are left blank on issued credentials.  You
    should stick to this option while in development to keep log messages to a reasonable size.
  - `static`: Static images are used to fill in the `card_front` and `card_back` attributes when issuing credentials.  This
    mode is useful when you don't yet have a true credential rendering service and want to issue credentials with placeholder
    images.  If this mode is selected, there are additional configuration parameters that must be set:
    - `STATIC_CARD_FRONT_IMAGE`: A path to an image file to be used for the `card_front` attribute when issuing credentials.
      This image should be small (<= 4KB) for performance reasons.
    - `STATIC_CARD_BACK_IMAGE`: A path to an image file to be used for the `card_back` attribute when issuing credentials.
      This image should be small (<= 4KB) for performance reasons.
  - `branding_server`: Credential images will be rendered by a remote service.  The service used by the hosted samples apps
    is not currently exposed to the public, but you could study the inputs to that service from the sample code and
    build a service of your own.  If this mode is selected, you have to provide information about the service and
    credential templates that should be used:
    - `BRANDING_SERVER_ENDPOINT`: A URL to `POST` credential attributes to in order to receive rendered credential images. 
	- `BRANDING_SERVER_FRONT_TEMPLATE`: The template to reference when asking the branding service for `card_front` images.
	- `BRANDING_SERVER_BACK_TEMPLATE`: The template to reference when asking the branding service for `card_back` images.
- `MY_URL`: The public URL for the app.  Not currently required or used.
- `CONNECTION_IMAGE_PROVIDER`: The method for attaching images to connection requests.  These connection images are most
  useful when used in conjunction with the `FRIENDLY_NAME` to help users identify the source of incoming connection offers.
  The available options are:
  - `none`: No images will be attached to connection offers.  This is the mode that should be used when developing, in order
     to keep log messages to a manageable size.
  - `static`: A static image will be attached to any connection offers.  Additional required parameters for this mode include:
    - `CONNECTION_ICON_PATH`: The path to an image file.  This image should be (<= 4KB) for performance reasons.
- `SESSION_SECRET`: The secret to use when creating and managing sessions for the sample app.
- `LOGIN_PROOF_PROVIDER`: The method for building verification requests for the verifiable credential login functionality.
  The available options are:
  - `none`: Users will not be able to log in using verifiable credentials.
  - `file`: A proof request described in a file will be used to permit users to log in to their accounts.  Required parameters
    for this mode include:
    - `LOGIN_PROOF_PATH`: The path to a file describing a login proof request.  See the example files used by the samples.
- `SIGNUP_PROOF_PROVIDER`: The method for verifying credentials when a user attempts to sign up for an account.  The options
  are as follows:
  - `none`: Users will not be able to sign up for accounts.
  - `account`: Users will be able to sign up for an account using a driver's license and proof of employment.  To modify
    the signup behavior to your use case, you'll have to write a provider of your own.  This mode requires the following
    additional parameters:
    - `SIGNUP_ACCOUNT_PROOF_PATH`: The path to a JSON file describing a signup proof request.  This file should describe
      attributes from a driver's license and attributes from an employment badge.
    - `SIGNUP_DMV_ISSUER_AGENT`: The agent name or agent URL for the DMV issuer.  The sample will attempt to establish a
      connection to this agent in order to acquire a list of published driver's license schemas.  Each of these schemas
      will be added to the restriction list for each driver's license attribute in the proof request.
    - `SIGNUP_HR_ISSUER_AGENT`: The agent name of agent URL for the HR issuer.  Serves the same purpose as `SIGNUP_DMV_ISSUER_AGENT`.
- `SCHEMA_TEMPLATE_PATH`: The path to a JSON file describing the credential schema for the issuer.  This parameter is configured
  in the Docker image file for each sample issuer and describes the locations of the driver's license, employment badge, and
  bank account schema files.
- `ACCEPT_INCOMING_CONNECTIONS`: A toggle that causes the sample app to pole for incoming connection offers and accept
  them.  This is the mechanism that allows BBCU to connect to Gov DMV and IBM HR in order to get a list of credential schemas
  when `SIGNUP_PROOF_PROVIDER === 'account'`.
- `ADMIN_API_USERNAME`: The username to use to protect the admin UI/API.  If this and `ADMIN_API_PASSWORD`
  are left blank, the admin panel will not be protected by authentication.
- `ADMIN_API_PASSWORD`: The password to use to protect the admin UI/API.
