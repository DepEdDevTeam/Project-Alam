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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ALAM sign-in link</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://pkflumjhhthxenzstwqn.supabase.co/storage/v1/object/public/email-assets/deped-logo.png" alt="Department of Education seal" style={logo} />
        <Heading style={h1}>Sign in to ALAM</Heading>
        <Text style={text}>
          Use this secure link to sign in to {siteName}. It will expire shortly for your protection.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Open ALAM
        </Button>
        <Text style={footer}>
          If you didn't request this sign-in link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
