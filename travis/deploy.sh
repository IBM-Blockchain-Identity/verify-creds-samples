#!/usr/bin/env bash

# Where is this script?!
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set some default parameters
KUBERNETES_NAMESPACE=${KUBERNETES_NAMESPACE:-ssi-samples}

DMV_AGENT_NAME=${DMV_AGENT_NAME:-gov-dmv}
IBMHR_AGENT_NAME=${IBMHR_AGENT_NAME:-ibm-hr}
BBCU_AGENT_NAME=${BBCU_AGENT_NAME:-bbcu}

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

sed -i "s+BRANDING_SERVER_ENDPOINT_HERE+$BRANDING_SERVER_ENDPOINT+g" $DEPLOYMENT_SPEC

# Configure ingress
INGRESS=$DIR/ingress.yml
echo "Setting up ingress file: $INGRESS"
cp $DIR/ingress_template.yml $INGRESS

echo "Configuring Kubectl to be able to talk to our cluster..."
$(bx cs cluster-config ${IBMCLOUD_DEPLOYMENT_CLUSTER} --export)

echo "Deleting existing issuer deployments"
kubectl delete deployment gov-dmv ibm-hr bbcu --namespace=$KUBERNETES_NAMESPACE

echo "Redeploying demo issuers"
(cd ${DIR}; kubectl apply -f deployment_spec.yml -f ingress.yml --namespace=$KUBERNETES_NAMESPACE)