/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your DepEd email for Project ALAM</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://pkflumjhhthxenzstwqn.supabase.co/storage/v1/object/public/email-assets/deped-logo.png" alt="Department of Education seal" style={logo} />
        <Heading style={h1}>Welcome to ALAM</Heading>
        <Text style={text}>
          Thanks for creating an account for{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          , the DepEd bilingual AI data assistant.
        </Text>
        <Text style={text}>
          Please confirm your DepEd email address (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) to start using ALAM for official DepEd work.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm DepEd email
        </Button>
        <Text style={footer}>
          If you didn't create an ALAM account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px',
  border: '1px solid #d9e2ec',
  borderRadius: '12px',
}
const logo = { width: '64px', height: '64px', margin: '0 0 22px' }
const h1 = {
  fontSize: '24px',
  fontWeight: '800' as const,
  color: '#062447',
  margin: '0 0 18px',
}
const text = {
  fontSize: '15px',
  color: '#526174',
  lineHeight: '1.6',
  margin: '0 0 22px',
}
const link = { color: '#003366', textDecoration: 'underline' }
const button = {
  backgroundColor: '#003366',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700' as const,
  borderRadius: '12px',
  padding: '13px 22px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#7b8794', margin: '30px 0 0' }
