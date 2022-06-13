#!/usr/bin/env bash

# Where is the script?!
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

VERSION=${TRAVIS_TAG:-latest}


if [ "$TRAVIS_BRANCH" = "newagency" ]
then
  GOVDMV_IMAGE_TAG=${GOVDMV_IMAGE_TAG:-verifycreds/gov-dmv-ti-dev:$VERSION}
  IBMHR_IMAGE_TAG=${IBMHR_IMAGE_TAG:-verifycreds/ibm-hr-ti-dev:$VERSION}
  BBCU_IMAGE_TAG=${BBCU_IMAGE_TAG:-verifycreds/bbcu-ti-dev:$VERSION}
  TESTHOLDER_IMAGE_TAG=${TESTHOLDER_IMAGE_TAG:-verifycreds/test-holder-ti-dev:$VERSION}
elif [ "$TRAVIS_BRANCH" = "newagencyprod" ]
then
  GOVDMV_IMAGE_TAG=${GOVDMV_IMAGE_TAG:-verifycreds/gov-dmv-ti:$VERSION}
  IBMHR_IMAGE_TAG=${IBMHR_IMAGE_TAG:-verifycreds/ibm-hr-ti:$VERSION}
  BBCU_IMAGE_TAG=${BBCU_IMAGE_TAG:-verifycreds/bbcu-ti:$VERSION}
  TESTHOLDER_IMAGE_TAG=${TESTHOLDER_IMAGE_TAG:-verifycreds/test-holder-ti:$VERSION}
else
  GOVDMV_IMAGE_TAG=${GOVDMV_IMAGE_TAG:-verifycreds/gov-dmv:$VERSION}
  IBMHR_IMAGE_TAG=${IBMHR_IMAGE_TAG:-verifycreds/ibm-hr:$VERSION}
  BBCU_IMAGE_TAG=${BBCU_IMAGE_TAG:-verifycreds/bbcu:$VERSION}
  TESTHOLDER_IMAGE_TAG=${TESTHOLDER_IMAGE_TAG:-verifycreds/test-holder:$VERSION}
fi

build_and_push () {
    local IMAGE_TAG=$1
    local APP_NAME=$2
    local BUILD_DIR=$3

    echo "Building $APP_NAME docker image"
    (cd ${BUILD_DIR}; docker build -t ${IMAGE_TAG} .)

    echo "Pushing $APP_NAME image $IMAGE_TAG"
    docker push ${IMAGE_TAG}
}


build_and_push $GOVDMV_IMAGE_TAG "Gov DMV" "$DIR/../gov-dmv"
build_and_push $IBMHR_IMAGE_TAG "IBM HR" "$DIR/../ibm-hr"
build_and_push $BBCU_IMAGE_TAG "BBCU" "$DIR/../bbcu"
build_and_push $TESTHOLDER_IMAGE_TAG "Test Holder" "$DIR/../test_holder"
