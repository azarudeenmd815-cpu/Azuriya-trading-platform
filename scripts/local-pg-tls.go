// Generate short-lived certificates for an isolated local PostgreSQL acceptance cluster.
package main
import("crypto/rand";"crypto/rsa";"crypto/x509";"crypto/x509/pkix";"encoding/pem";"math/big";"net";"os";"path/filepath";"time")
func main(){
 dir:=os.Args[1]; if err:=os.MkdirAll(dir,0700);err!=nil{panic(err)}
 caKey,err:=rsa.GenerateKey(rand.Reader,2048);if err!=nil{panic(err)}
 ca:=&x509.Certificate{SerialNumber:big.NewInt(1),Subject:pkix.Name{CommonName:"Azuriya local acceptance CA"},NotBefore:time.Now().Add(-time.Hour),NotAfter:time.Now().Add(48*time.Hour),IsCA:true,BasicConstraintsValid:true,KeyUsage:x509.KeyUsageCertSign|x509.KeyUsageDigitalSignature}
 caDER,err:=x509.CreateCertificate(rand.Reader,ca,ca,&caKey.PublicKey,caKey);if err!=nil{panic(err)}
 caCert,err:=x509.ParseCertificate(caDER);if err!=nil{panic(err)}
 key,err:=rsa.GenerateKey(rand.Reader,2048);if err!=nil{panic(err)}
 leaf:=&x509.Certificate{SerialNumber:big.NewInt(2),Subject:pkix.Name{CommonName:"localhost"},DNSNames:[]string{"localhost"},IPAddresses:[]net.IP{net.ParseIP("127.0.0.1"),net.ParseIP("::1")},NotBefore:time.Now().Add(-time.Hour),NotAfter:time.Now().Add(24*time.Hour),KeyUsage:x509.KeyUsageDigitalSignature|x509.KeyUsageKeyEncipherment,ExtKeyUsage:[]x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
 der,err:=x509.CreateCertificate(rand.Reader,leaf,caCert,&key.PublicKey,caKey);if err!=nil{panic(err)}
 if err:=os.WriteFile(filepath.Join(dir,"ca.crt"),pem.EncodeToMemory(&pem.Block{Type:"CERTIFICATE",Bytes:caDER}),0600);err!=nil{panic(err)}
 if err:=os.WriteFile(filepath.Join(dir,"server.crt"),pem.EncodeToMemory(&pem.Block{Type:"CERTIFICATE",Bytes:der}),0600);err!=nil{panic(err)}
 if err:=os.WriteFile(filepath.Join(dir,"server.key"),pem.EncodeToMemory(&pem.Block{Type:"RSA PRIVATE KEY",Bytes:x509.MarshalPKCS1PrivateKey(key)}),0600);err!=nil{panic(err)}
}
