/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ALAM verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://pkflumjhhthxenzstwqn.supabase.co/storage/v1/object/public/email-assets/deped-logo.png" alt="Department of Education seal" style={logo} />
        <Heading style={h1}>Confirm your identity</Heading>
        <Text style={text}>Use this code to continue securely in ALAM:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request it, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  display: 'inline-block',
  fontFamily: 'Courier, monospace',
  fontSize: '24px',
  fontWeight: '800' as const,
  letterSpacing: '4px',
  color: '#062447',
  backgroundColor: '#f6f9fc',
  border: '1px solid #d9e2ec',
  borderRadius: '12px',
  padding: '14px 18px',
  margin: '0 0 28px',
}
const footer = { fontSize: '12px', color: '#7b8794', margin: '30px 0 0' }
