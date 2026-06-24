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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your ALAM email change</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://pkflumjhhthxenzstwqn.supabase.co/storage/v1/object/public/email-assets/deped-logo.png" alt="Department of Education seal" style={logo} />
        <Heading style={h1}>Confirm your email change</Heading>
        <Text style={text}>
          You requested to change your email address for {siteName} from{' '}
          <Link href={`mailto:${email}`} style={link}>{email}</Link>{' '}
          to{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>
        <Text style={text}>Confirm this change to keep your ALAM account up to date.</Text>
        <Button style={button} href={confirmationUrl}>
          Confirm email change
        </Button>
        <Text style={footer}>
          If you didn't request this change, please secure your account immediately.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
