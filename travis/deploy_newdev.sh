#!/usr/bin/env bash

# Where is this script?!
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set some default parameters
export KUBERNETES_NAMESPACE=ssi-samples-dev

export VERSION=latest

export GOVDMV_IMAGE_TAG=verifycreds/gov-dmv-ti:$VERSION
export IBMHR_IMAGE_TAG=verifycreds/ibm-hr-ti:$VERSION
export BBCU_IMAGE_TAG=verifycreds/bbcu-ti:$VERSION

export ACCOUNT_URL=$NEWDEV_ACCOUNT_URL

export DMV_AGENT_ID=$NEWDEV_DMV_AGENT_ID
export DMV_AGENT_NAME=govdmv
export DMV_AGENT_PASSWORD=$NEWDEV_DMV_AGENT_PASSWORD
export DMV_AGENT_DID=$NEWDEV_DMV_AGENT_DID

export IBMHR_AGENT_ID=$NEWDEV_IBMHR_AGENT_ID
export IBMHR_AGENT_NAME=ibmhr
export IBMHR_AGENT_PASSWORD=$NEWDEV_IBMHR_AGENT_PASSWORD
export IBMHR_AGENT_DID=$NEWDEV_IBMHR_AGENT_DID

export BBCU_AGENT_ID=$NEWDEV_BBCU_AGENT_ID
export BBCU_AGENT_NAME=bbcu
export BBCU_AGENT_PASSWORD=$NEWDEV_BBCU_AGENT_PASSWORD

export COUCHDB_USER_NAME=$NEWDEV_COUCHDB_USER_NAME
export COUCHDB_USER_PASSWORD=$NEWDEV_COUCHDB_USER_PASSWORD

export DMV_AGENT_URL=$DMV_AGENT_NAME
export IBMHR_AGENT_URL=$IBMHR_AGENT_NAME

export IBMCLOUD_DEPLOYMENT_CLUSTER=$NEWDEV_IBMCLOUD_DEPLOYMENT_CLUSTER

# INGRESS_URLs
export CLUSTER_INGRESS_URL=ti-agency-dev.us-east.containers.appdomain.cloud
export DMV_CLUSTER_INGRESS_URL=gov-dmv-dev.ti-agency-dev.us-east.containers.appdomain.cloud
export IBMHR_CLUSTER_INGRESS_URL=ibm-hr-dev.ti-agency-dev.us-east.containers.appdomain.cloud
export BBCU_CLUSTER_INGRESS_URL=bbcu-dev.ti-agency-dev.us-east.containers.appdomain.cloud

export DMV_VANITY_URL=gov-dev.livedemo.verify-creds.com
export IBMHR_VANITY_URL=employer-dev.livedemo.verify-creds.com
export BBCU_VANITY_URL=bbcu-dev.livedemo.verify-creds.com

$DIR/deploy.sh
