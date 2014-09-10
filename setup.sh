JAVA_HOME="/usr/lib/jvm/java-7-openjdk-amd64"
PATH=$JAVA_HOME/bin:$PATH

bash gradlew war

echo "drop table authz_approvals; drop table authz_approvals_old; drop table expiring_code_store; drop table external_group_mapping; drop table group_membership; drop table groups; drop table oauth_client_details; drop table oauth_code; drop table schema_version; drop table sec_audit; drop table users;" | psql -U postgres -d uaa

sudo rm -R /var/lib/tomcat7/webapps/uaa*
sudo cp uaa/build/libs/cloudfoundry-identity-uaa-1.8.3.war /var/lib/tomcat7/webapps/uaa.war

cd proxy
npm install --no-bin-links
