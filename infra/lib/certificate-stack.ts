import { Stack, type StackProps } from 'aws-cdk-lib'
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from 'aws-cdk-lib/aws-certificatemanager'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'
import { DOMAIN } from './dns-stack'

export const WWW_DOMAIN = `www.${DOMAIN}`

export type CertificateStackProps = StackProps & {
  zone: IPublicHostedZone
}

// The certificate CloudFront will serve harpguru.com with, from step 8. It
// lives in us-east-1 because CloudFront only takes certificates from there,
// wherever the rest of the site is.
//
// It covers the apex and www. www only ever redirects to the apex, but the
// redirect happens after the TLS handshake, so www needs a valid certificate
// too, or a visitor typing it sees a warning instead of being redirected.
//
// Validated through DNS: CloudFormation writes ACM's CNAME records into the
// zone and waits until the certificate is issued, so the deploy finishes only
// once it is. The records must stay, because ACM renews against them.
//
// The zone comes from HarpguruDns in London. Since references here are weak,
// this is a plain output read across regions, with no custom resource.
//
// Not termination protected: it holds nothing that can't be recreated, and
// once CloudFront uses it, ACM refuses to delete it anyway.
export class CertificateStack extends Stack {
  readonly certificate: ICertificate

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props)

    this.certificate = new Certificate(this, 'Certificate', {
      domainName: DOMAIN,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: CertificateValidation.fromDns(props.zone),
      // The name shown in ACM's console; certificates there have no other.
      certificateName: DOMAIN,
    })
  }
}
