/*******************************************************************************
 *     Cloud Foundry
 *     Copyright (c) [2009-2014] Pivotal Software, Inc. All Rights Reserved.
 *
 *     This product is licensed to you under the Apache License, Version 2.0 (the "License").
 *     You may not use this product except in compliance with the License.
 *
 *     This product includes a number of subcomponents with
 *     separate copyright notices and license terms. Your use of these
 *     subcomponents is subject to the terms and conditions of the
 *     subcomponent's license, as noted in the LICENSE file.
 *******************************************************************************/
package org.cloudfoundry.identity.uaa.authentication.manager;

import junit.framework.TestCase;
import org.cloudfoundry.identity.uaa.user.UaaAuthority;
import org.junit.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.provider.DefaultAuthorizationRequest;
import org.springframework.security.oauth2.provider.OAuth2Authentication;

import javax.naming.AuthenticationException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ScopeAuthenticationManagerTests extends TestCase {
    private ScopeAuthenticationManager authenticationManager;
    Map<String,String> clientCredentials;
    private DefaultAuthorizationRequest request;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        authenticationManager = new ScopeAuthenticationManager();
        authenticationManager.setThrowOnNotAuthenticated(true);
        authenticationManager.setRequiredScopes(Collections.singletonList("oauth.login"));
        clientCredentials = new HashMap<>();
        clientCredentials.put("client_id","login");
        clientCredentials.put("grant_type","client_credentials");
        clientCredentials.put("scope","oauth.login,oauth.approval");
        request = new DefaultAuthorizationRequest(clientCredentials);
    }

    public void testPasswordAuthenticate() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = new UsernamePasswordAuthenticationToken("username", "password");
        OAuth2Authentication auth = new OAuth2Authentication(request, userAuth);
        Authentication authentication = authenticationManager.authenticate(auth);
        //false since we don't authenticate the user yet
        assertFalse(authentication.isAuthenticated());
    }

    public void testPasswordAuthenticateSucceed() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = new UsernamePasswordAuthenticationToken("username", "password", UaaAuthority.USER_AUTHORITIES);
        OAuth2Authentication auth = new OAuth2Authentication(request, userAuth);
        Authentication authentication = authenticationManager.authenticate(auth);
        assertTrue(authentication.isAuthenticated());
    }

    public void testAuthenticate() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = null;
        OAuth2Authentication auth = new OAuth2Authentication(request, userAuth);
        Authentication authentication = authenticationManager.authenticate(auth);
        assertTrue(authentication.isAuthenticated());
    }

    @Test(expected = AuthenticationException.class)
    public void testAuthenticateInsufficientScope() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = null;
        clientCredentials.put("scope","oauth.approval");
        OAuth2Authentication auth = new OAuth2Authentication(request, userAuth);
        authenticationManager.authenticate(auth);
    }

    public void testDedup() throws Exception {
        List<String> l1 = Arrays.asList("test","test","test");
        assertEquals(1, authenticationManager.dedup(l1).size());
        l1 = Arrays.asList("t1","t2","t3");
        assertEquals(3, authenticationManager.dedup(l1).size());
    }
}