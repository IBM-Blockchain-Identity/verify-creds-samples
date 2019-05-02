# verify-creds-samples

Play with these samples to learn how to integrate the [openssi-websdk](https://github.com/IBM-Blockchain-Identity/openssi-websdk) into your own website.

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

1. Visit your agent account management page and provision three new agents, `govdmv`, `ibmhr`,
and `bbcu`.  Save the passwords the you create for each agent; you'll need them later.

2. Get the url for your account.  This would have been emailed to you when you created your agent account.

3. Make sure all of your agents have their `role` set to `TRUST_ANCHOR`.  This is a requirement for the agents to be
able to issue credentials.  You can use the following `curl` command to set this property on each of the above agents:
    ```
    curl -u <account_admin_agent_name>:<account_admin_agent_password> -X PATCH \
        <account_url>/api/v1/identities/<agent_name> \
        -H 'Content-Type: application/json' \
        -d '{ "role": "TRUST_ANCHOR" }'
    ```

4. Install...
    - [the Verify Creds mobile app]().
    OR
    - [the Verify Creds browser extension]().

### Building the samples

Build all the sample apps as docker images using the following command:

```
docker-compose build
```

### Running the samples

1. Setup your `.env` file with the necessary parameters to connect.
    ```
    $ cp .env_template .env
    
    # edit your .env file
    
    $ cat .env
    ACCOUNT_URL=https://my-account.example.com
    AGENT_ADMIN_NAME=admin
    AGENT_ADMIN_PASSWORD=****
    
    DMV_AGENT_NAME=govdmv
    DMV_AGENT_PASSWORD=****
    DMV_URL=http://192.168.1.15:8090
    
    IBMHR_AGENT_NAME=ibmhr
    IBMHR_AGENT_PASSWORD=****
    IBMHR_URL=http://192.168.1.15:8091
    
    BBCU_AGENT_NAME=bbcu
    BBCU_AGENT_PASSWORD=****
    BBCU_URL=http://192.168.1.15:8092
    ```
    > For the `<APP>_URL` parameters, you'll generally use the IP address of your machine.  This must be an IP address that
    your mobile device can reach, as the mobile app will need to be able to make requests to the sample apps.

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