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
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your ALAM password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://pkflumjhhthxenzstwqn.supabase.co/storage/v1/object/public/email-assets/deped-logo.png" alt="Department of Education seal" style={logo} />
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {siteName}. Choose a new password to regain access to ALAM.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset password
        </Button>
        <Text style={footer}>
          If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
