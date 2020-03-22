#!/usr/bin/env bash

# Where is this script?!
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set some default parameters
KUBERNETES_NAMESPACE=${KUBERNETES_NAMESPACE:-ssi-samples}

VERSION=${TRAVIS_TAG:-latest}

GOVDMV_IMAGE_TAG=${GOVDMV_IMAGE_TAG:-verifycreds/gov-dmv:$VERSION}
IBMHR_IMAGE_TAG=${IBMHR_IMAGE_TAG:-verifycreds/ibm-hr:$VERSION}
BBCU_IMAGE_TAG=${BBCU_IMAGE_TAG:-verifycreds/bbcu:$VERSION}

DMV_AGENT_NAME=${DMV_AGENT_NAME:-govdmv}
IBMHR_AGENT_NAME=${IBMHR_AGENT_NAME:-ibmhr}
BBCU_AGENT_NAME=${BBCU_AGENT_NAME:-bbcu}

DMV_AGENT_URL=${DMV_AGENT_URL:-$DMV_AGENT_NAME}
IBMHR_AGENT_URL=${IBMHR_AGENT_URL:-$IBMHR_AGENT_NAME}

DMV_SESSION_SECRET=${DMV_SESSION_SECRET:-$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo '')}
IBMHR_SESSION_SECRET=${IBMHR_SESSION_SECRET:-$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo '')}
BBCU_SESSION_SECRET=${BBCU_SESSION_SECRET:-$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo '')}

# INGRESS_URLs
CLUSTER_INGRESS_URL=${CLUSTER_INGRESS_URL:-credimi-dev.us-south.containers.appdomain.cloud}
DMV_CLUSTER_INGRESS_URL=${DMV_CLUSTER_INGRESS_URL:-gov-dmv.credimi-dev.us-south.containers.appdomain.cloud}
IBMHR_CLUSTER_INGRESS_URL=${IBMHR_CLUSTER_INGRESS_URL:-ibm-hr.credimi-dev.us-south.containers.appdomain.cloud}
BBCU_CLUSTER_INGRESS_URL=${BBCU_CLUSTER_INGRESS_URL:-bbcu.credimi-dev.us-south.containers.appdomain.cloud}

DMV_VANITY_URL=${DMV_VANITY_URL:-gov.livedemo.verify-creds.com}
IBMHR_VANITY_URL=${IBMHR_VANITY_URL:-employer.livedemo.verify-creds.com}
BBCU_VANITY_URL=${BBCU_VANITY_URL:-bbcu.livedemo.verify-creds.com}

# Configure deployment spec
DEPLOYMENT_SPEC=$DIR/deployment_spec.yml
echo "Setting up deployment spec file: $DEPLOYMENT_SPEC"
cp $DIR/deployment_spec_template.yml $DEPLOYMENT_SPEC

sed -i "s+ACCOUNT_URL_HERE+${ACCOUNT_URL}+g" $DEPLOYMENT_SPEC

sed -i "s+DMV_AGENT_NAME_HERE+$DMV_AGENT_NAME+g" $DEPLOYMENT_SPEC
sed -i "s+DMV_AGENT_PASSWORD_HERE+$DMV_AGENT_PASSWORD+g" $DEPLOYMENT_SPEC

sed -i "s+IBMHR_AGENT_NAME_HERE+$IBMHR_AGENT_NAME+g" $DEPLOYMENT_SPEC
sed -i "s+IBMHR_AGENT_PASSWORD_HERE+$IBMHR_AGENT_PASSWORD+g" $DEPLOYMENT_SPEC

sed -i "s+BBCU_AGENT_NAME_HERE+$BBCU_AGENT_NAME+g" $DEPLOYMENT_SPEC
sed -i "s+BBCU_AGENT_PASSWORD_HERE+$BBCU_AGENT_PASSWORD+g" $DEPLOYMENT_SPEC

sed -i "s+HR_AGENT_URL_HERE+$IBMHR_AGENT_URL+g" $DEPLOYMENT_SPEC
sed -i "s+DMV_AGENT_URL_HERE+$DMV_AGENT_URL+g" $DEPLOYMENT_SPEC

sed -i "s+COUCHDB_USER_NAME_HERE+$COUCHDB_USER_NAME+g" $DEPLOYMENT_SPEC
sed -i "s+COUCHDB_USER_PASSWORD_HERE+$COUCHDB_USER_PASSWORD+g" $DEPLOYMENT_SPEC

sed -i "s+BRANDING_SERVER_ENDPOINT_HERE+$BRANDING_SERVER_ENDPOINT+g" $DEPLOYMENT_SPEC

sed -i "s+ADMIN_API_USERNAME_HERE+$ADMIN_API_USERNAME+g" $DEPLOYMENT_SPEC
sed -i "s+ADMIN_API_PASSWORD_HERE+$ADMIN_API_PASSWORD+g" $DEPLOYMENT_SPEC

sed -i "s+DMV_IMAGE_TAG_HERE+$GOVDMV_IMAGE_TAG+g" $DEPLOYMENT_SPEC
sed -i "s+IBMHR_IMAGE_TAG_HERE+$IBMHR_IMAGE_TAG+g" $DEPLOYMENT_SPEC
sed -i "s+BBCU_IMAGE_TAG_HERE+$BBCU_IMAGE_TAG+g" $DEPLOYMENT_SPEC

sed -i "s+DMV_SESSION_SECRET_HERE+$DMV_SESSION_SECRET+g" $DEPLOYMENT_SPEC
sed -i "s+IBMHR_SESSION_SECRET_HERE+$IBMHR_SESSION_SECRET+g" $DEPLOYMENT_SPEC
sed -i "s+BBCU_SESSION_SECRET_HERE+$BBCU_SESSION_SECRET+g" $DEPLOYMENT_SPEC

# Configure ingress
INGRESS=$DIR/ingress.yml
echo "Setting up ingress file: $INGRESS"
cp $DIR/ingress_template.yml $INGRESS

sed -i "s+DMV_CLUSTER_INGRESS_URL_HERE+${DMV_CLUSTER_INGRESS_URL}+g" $INGRESS
sed -i "s+IBMHR_CLUSTER_INGRESS_URL_HERE+${IBMHR_CLUSTER_INGRESS_URL}+g" $INGRESS
sed -i "s+BBCU_CLUSTER_INGRESS_URL_HERE+${BBCU_CLUSTER_INGRESS_URL}+g" $INGRESS
sed -i "s+CLUSTER_INGRESS_URL_HERE+${CLUSTER_INGRESS_URL}+g" $INGRESS

sed -i "s+DMV_VANITY_URL_HERE+${DMV_VANITY_URL}+g" $INGRESS
sed -i "s+IBMHR_VANITY_URL_HERE+${IBMHR_VANITY_URL}+g" $INGRESS
sed -i "s+BBCU_VANITY_URL_HERE+${BBCU_VANITY_URL}+g" $INGRESS

echo "Configuring Kubectl to be able to talk to our cluster..."
ibmcloud ks cluster config --cluster ${IBMCLOUD_DEPLOYMENT_CLUSTER}

echo "Deleting existing issuer deployments"
kubectl delete deployment gov-dmv ibm-hr bbcu --namespace=$KUBERNETES_NAMESPACE

echo "Redeploying demo issuers"
(cd ${DIR}; kubectl apply -f deployment_spec.yml -f ingress.yml --namespace=$KUBERNETES_NAMESPACE)
